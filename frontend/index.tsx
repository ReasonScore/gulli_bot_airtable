import { Button, initializeBlock, Loader, useCursor, useLoadable, useRecords } from '@airtable/blocks/ui';
import React, { useEffect, useState } from 'react';
import { base } from '@airtable/blocks';
import { Action, calculateScoreActions, Claim, ClaimEdge, RepositoryLocalPure, Score, ScoreTree } from "@reasonscore/core";
import Cursor from '@airtable/blocks/dist/types/src/models/cursor';

interface MainClaims { [key: string]: { content: string, id: string } }

function GulliBotAirtable() {
    const table = base.getTableByName("Claims")
    const records = useRecords(table)
    const edgesByParendId: { [key: string]: ClaimEdge[] } = {};
    const claims: { [key: string]: Claim } = {};
    const [waiting, setWaiting] = useState(false);
    const [currentMainClaims, setCurrentMainClaim] = useState<MainClaims>({});
    const cursor = useCursor();
    useLoadable(cursor);

    useEffect(() => {
        cursor.watch(['selectedRecordIds'], (_cursor: Cursor) => {
            if (_cursor.activeTableId === "tblJg9zcOB3J7OiAY") {
                const filteredRecords = records.filter(record => _cursor.selectedRecordIds.includes(record.id));
                const newMainClaims: { [key: string]: { content: string, id: string } } = {}
                for (const record of filteredRecords) {
                    const mainClaimRecordsInfo = record.getCellValue("Main Claim") as { id: string, name: string }[]
                    for (const mainClaimRecordInfo of mainClaimRecordsInfo) {
                        newMainClaims[mainClaimRecordInfo.id] = { content: mainClaimRecordInfo.name, id: mainClaimRecordInfo.id }
                    }
                }
                if (JSON.stringify(currentMainClaims) !== JSON.stringify(newMainClaims)) {
                    setCurrentMainClaim(newMainClaims)
                }
            }
        })
    }, []);


    async function handleDownloadClick() {
        setWaiting(true)
        const mainClaimIds: string[] = [];
        try {
            const repository = await calculateScores(mainClaimIds);
            repository.rsData.actionsLog = []
            console.log("rsData", repository.rsData)
            download(
                JSON.stringify(repository.rsData),
                'rsData.json'
            )
        } catch (error) {
            console.error(error)
        }
        setWaiting(false);
    }

    async function calculateScores(mainClaimIds: string[]) {
        for (const record of records) {
            // collect all the claims
            if (record.name.length > 0) {
                claims[record.id] = new Claim(record.name, record.id);
                const parents = record.getCellValue("Parent Claims") as { id: string; }[] || undefined;
                if (parents) {
                    for (const parent of parents) {
                        const edge = new ClaimEdge(parent.id, record.id,
                            (record.getCellValue("Affects") as any).name === "Importance" ? "relevance" : "confidence",
                            record.getCellValue("Pro") as boolean
                        );
                        if (edgesByParendId[parent.id]) {
                            edgesByParendId[parent.id].push(edge);
                        } else {
                            edgesByParendId[parent.id] = [edge];
                        }
                    }
                }
            }

            // find Main Claims
            // if ((record.getCellValue("Affects") as any).name === "is Main") {
            //     mainClaimIds.push(record.id)
            // }
        }

        for (const mainClaimInfo of Object.values(currentMainClaims)) {
            mainClaimIds.push(mainClaimInfo.id);
        }

        const repository = new RepositoryLocalPure();

        //CalculateMainClaims
        for (const mainClaimId of mainClaimIds) {
            const actions: Action[] = [];
            processClaimId(mainClaimId, actions);
            await calculateScoreActions({ actions: actions, repository: repository });
            await calculateScoreActions({
                actions: [
                    new Action(new ScoreTree(mainClaimId, "mainScore", undefined, "ScoreTree"), undefined, "add_scoreTree")
                ], repository: repository
            });

        }
        return repository;
    }

    async function process() {
        setWaiting(true)
        const mainClaimIds: string[] = [];
        try {
            // Add Items
            const repository = await calculateScores(mainClaimIds);

            // Update Cells
            for (const record of records) {
                const scoreId = repository.rsData.scoreIdsBySourceId[record.id]
                if (scoreId) {
                    const confidence = (repository.rsData.items[scoreId[0]] as Score).confidence;
                    if (record.getCellValue("Confidence") !== confidence) {
                        await table.updateRecordAsync(record.id, { "Confidence": confidence })
                    }

                    const relevance = (repository.rsData.items[scoreId[0]] as Score).relevance;
                    if (record.getCellValue("Relevance") !== relevance) {
                        await table.updateRecordAsync(record.id, { "Relevance": relevance })
                    }
                }
            }

            repository.rsData.actionsLog = []
            console.log("rsData", repository.rsData)


        } catch (error) {
            console.error(error)
        }
        setWaiting(false);
    }

    function processClaimId(claimId: string, actions: Action[]) {//}, parentId?: string | undefined) {
        actions.push(new Action(claims[claimId], undefined, "add_claim", claimId),)
        if (edgesByParendId[claimId]) {
            for (const edge of edgesByParendId[claimId]) {
                actions.push(new Action(edge, undefined, "add_claimEdge"))
                processClaimId(edge.childId, actions);//, claimId);
            }
        }
    }

    const download = async (data: any, suggestedFileName: string) => {
        // TODO: Consider to moving to core from this and from editor
        // @ts-ignore
        if (window.showSaveFilePicker) {
            // @ts-ignore
            const fileHandle = await window.showSaveFilePicker();
            // Create a FileSystemWritableFileStream to write to.
            const writable = await fileHandle.createWritable(data);
            // Write the contents of the file to the stream.
            await writable.write();
            // Close the file and write the contents to disk.
            await writable.close();
        } else {
            if (window.confirm("Please use Chrome version 91 or above to download large files. Do you want to attempt anyay?")) {
                var hiddenElement = document.createElement('a');
                hiddenElement.href = 'data:text/csv;charset=utf-8,' + encodeURI(data);
                hiddenElement.target = '_blank';
                hiddenElement.download = suggestedFileName;
                hiddenElement.click();
            }
        }
    }


    return <div>
        <Button
            onClick={process}
            variant="primary"
            size="large"
            icon="bolt"
            disabled={waiting}
            margin={3}
        >
            Process
        </Button>
        <Button
            onClick={handleDownloadClick}
            variant="primary"
            size="large"
            icon="bolt"
            disabled={waiting}
        >
            Download
        </Button>
        {!waiting ? '' :
            <Loader scale={0.5} />
        }
        <ul>
            {Object.values(currentMainClaims).map((mainClaim) => {
                return <li key={mainClaim.id}>{mainClaim.content}</li>
            })}
        </ul>

        {/* <pre>
            {JSON.stringify(Object.values(currentMainClaims), undefined, 2)}
        </pre> */}

    </div>;
}

initializeBlock(() => <GulliBotAirtable />);
