import { initializeBlock, useRecords } from '@airtable/blocks/ui';
import React from 'react';
import { base } from '@airtable/blocks';
import { Action, calculateScoreActions, Claim, ClaimEdge, RepositoryLocalPure, RsData, ScoreTree } from "@reasonscore/core";


function HelloWorldTypescriptApp() {
    const table = base.getTableByName("Claims")
    const records = useRecords(table)
    const edgesByParendId: { [key: string]: ClaimEdge[] } = {};
    const claims: { [key: string]: Claim } = {};
    const mainClaimIds: string[] = [];

    async function Process() {

        // Add Items
        for (const record of records) {
            // collect all the claims
            if (record.name.length > 0) {
                claims[record.id] = new Claim(record.name, record.id);
                const parents = record.getCellValue("Parent Claims") as { id: string }[] || undefined;
                if (parents) {
                    for (const parent of parents) {
                        const edge = new ClaimEdge(parent.id, record.id, undefined,
                            record.getCellValue("Team") === "Skepti" ? false : true
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
            console.log("result", await (repository.getScore(mainClaimId)));
            console.log("data", repository.rsData)
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
    }

    Process();


    // console.log("claims", claims)
    // console.log("childrenIdsByParendId", childrenIdsByParendId)
    // console.log("actions", actions)

    return <div>
        ***
        <pre>
            {/* {JSON.stringify(rsData, undefined, 2)} */}
        </pre>
        {/* {records ? records.map(
            record => <div>{record.name} </div>
        )
            : null} */}
        ***
    </div>;
}

initializeBlock(() => <HelloWorldTypescriptApp />);
