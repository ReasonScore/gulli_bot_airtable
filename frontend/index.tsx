import { Button, initializeBlock, Loader, useRecords } from '@airtable/blocks/ui';
import React, { useState } from 'react';
import { base } from '@airtable/blocks';
import { Action, calculateScoreActions, Claim, ClaimEdge, isScore, RepositoryLocalPure, RsData, Score, ScoreTree } from "@reasonscore/core";


function HelloWorldTypescriptApp() {
    const table = base.getTableByName("Claims")
    const records = useRecords(table)
    const edgesByParendId: { [key: string]: ClaimEdge[] } = {};
    const claims: { [key: string]: Claim } = {};
    const mainClaimIds: string[] = [];
    const [waiting, setWaiting] = useState(false);

    async function process() {
        setWaiting(true)
        try {


            // Add Items
            for (const record of records) {
                // collect all the claims
                if (record.name.length > 0) {
                    claims[record.id] = new Claim(record.name, record.id);
                    const parents = record.getCellValue("Parent Claims") as { id: string }[] || undefined;
                    if (parents) {
                        for (const parent of parents) {
                            const edge = new ClaimEdge(parent.id, record.id,
                                (record.getCellValue("Affects") as any).name === "Importance" ? "relevance" : "confidence",
                                (record.getCellValue("Team") as any).name === "Skepti" ? false : true
                            )
                            if (edgesByParendId[parent.id]) {
                                edgesByParendId[parent.id].push(edge)
                            } else {
                                edgesByParendId[parent.id] = [edge]
                            }
                        }
                    }
                }

                // find Main Claims
                if ((record.getCellValue("Affects") as any).name === "is Main") {
                    mainClaimIds.push(record.id)
                }
            }

            //CalculateMainClaims
            for (const mainClaimId of mainClaimIds) {
                const repository = new RepositoryLocalPure();
                const actions: Action[] = [];
                processClaimId(mainClaimId, actions);
                await calculateScoreActions({ actions: actions, repository: repository })
                await calculateScoreActions({
                    actions: [
                        new Action(new ScoreTree(mainClaimId, mainClaimId, undefined, mainClaimId), undefined, "add_scoreTree")
                    ], repository: repository
                })
                for (const record of records) {
                    const scoreId = repository.rsData.scoreIdsBySourceId[record.id]
                    if (scoreId) {
                        const confidence = (repository.rsData.items[scoreId[0]] as Score).confidence;
                        if (record.getCellValue("Confidence") !== confidence) {
                            await table.updateRecordAsync(record.id, { "Confidence": confidence })
                        }
                    }
                }

                // console.log("result", await (repository.getScore(mainClaimId)));
                // console.log("data", repository.rsData)
            }


        } catch (error) {
            console.error(error)
        }
        setWaiting(false);
    }

    function processClaimId(claimId: string, actions: Action[], parentId?: string | undefined) {
        actions.push(new Action(claims[claimId], undefined, "add_claim", claimId),)
        if (edgesByParendId[claimId]) {
            for (const edge of edgesByParendId[claimId]) {
                actions.push(new Action(edge, undefined, "add_claimEdge"))
                processClaimId(edge.childId, actions, claimId);
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
        >
            Process
        </Button>
        {!waiting ? '' :
            <Loader scale={0.5} />
        }
        <pre>
            {/* {JSON.stringify(rsData, undefined, 2)} */}
        </pre>
    </div>;
}

initializeBlock(() => <HelloWorldTypescriptApp />);
