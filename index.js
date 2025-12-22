'use strict';

const mongoose = require('mongoose');
var mongodb = require('mongodb');
var ObjectId = mongodb.ObjectId;
const { CRMOwnertoUserIDMap } = require('realtimatecommon/common/typedefs');

const { fetchEscrowTxnsByUserId } = require('./escrowService');
const { computeAccountDisbursements } = require('./accountDisbursements');
const { generateDisbursementsExcel } = require('./exportToExcel');

/**
 * AWS Lambda handler – triggered by EventBridge cron.
 *
 * Example EventBridge rule input:
 * {
 *   "userId": "68d26dcc287f9cf71fd8aa8d"
 * }
 */
exports.handler = async (event) => {
    try {
        // Basic screening for input
        const userId = event?.userId || process.env.USER_ID;
        if (!userId) {
            console.error('No userId supplied in event or USER_ID env var.');
            return { statusCode: 400, body: JSON.stringify({ message: 'Missing userId' }) };
        }

        // Delegate to service layer
        const txnsByAccount = await fetchEscrowTxnsByUserId(userId);
        const accountDisbursements = await computeAccountDisbursements(txnsByAccount);
        const result = await generateDisbursementsExcel(accountDisbursements, { outputPath: 'Downloads' });

        return {
            statusCode: 200,
            message: 'Successfully created disbursement file',
            result
        };
    } catch (error) {
        console.error('Error in Lambda:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Internal server error', error: String(error) }),
        };
    }
};

// For testing
this.handler({
    userId: new ObjectId(CRMOwnertoUserIDMap.oroproptech),
});
