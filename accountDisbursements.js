'use strict';

const OwnershipDisbursementAccount = require('realtimatecommon/common/disbursement_accounts');

/**
 * Compute disbursement breakdowns per escrow account.
 * Mirrors the business logic from reconcile.js but operates on the
 * txnsByAccount array returned by fetchEscrowTxnsByUserId().
 *
 * @param {Array} txnsByAccount - Aggregated escrow records
 * @returns {Array} disbursement objects ready for export
 */
async function computeAccountDisbursements(txnsByAccount = []) {
    if (!Array.isArray(txnsByAccount)) {
        console.error('computeAccountDisbursements expected an array input.');
        throw new Error('computeAccountDisbursements expected an array input.');
    }

    const results = txnsByAccount.map((element) => {
        // Require disbursement rules
        const hasRules =
            element?.disbursementRules &&
            element.disbursementRules[0]?.length > 0 &&
            (element.disbursementRules[0][0]?.percentage !== undefined ||
                element.disbursementRules[0][0]?.fixedAmount !== undefined);
        if (!hasRules) {
            return null;
        }

        const ownerPMSDisbAccount = OwnershipDisbursementAccount[element.ownership];
        if (!ownerPMSDisbAccount) {
            throw new Error('Did not find the ownership disbursement account for ' + element.ownership);
        }
        const disbursement = {};

        // Skip if already disbursed >80% of rent and over threshold
        if (
            Math.abs(element.disbursedThisMonth) >= 1000 &&
            Math.abs(element.disbursedThisMonth) > element.rent * 0.8
        ) {
            console.log(
                `${element.escrow.accountNum}: Already disbursed ${element.disbursedThisMonth} of rent ${element.rent} this month. Skipping...`
            );
            return null;
        }

        // First accumulate fixed amounts (add GST for PMS account when taxesExtra is true)
        let totalFixedAmount = 0;
        for (let i = 0; i < element.disbursementRules[0].length; i++) {
            const disb = element.disbursementRules[0][i];
            if (!isNaN(disb?.fixedAmount)) {
                let currentAmount = disb.fixedAmount;
                if (disb.depositAccount.accountNum === ownerPMSDisbAccount?.accountNumber && disb.taxesExtra) {
                    currentAmount = (currentAmount * 1.18).toFixed(2); // Including GST
                    currentAmount = Math.ceil(currentAmount); // round up
                }
                disbursement[`disbursement${i + 1}_fixedAmount`] = Number(currentAmount);
                disbursement[`disbursement${i + 1}_accountName`] = disb.depositAccount.accountName;
                disbursement[`disbursement${i + 1}_bankName`] = disb.depositAccount.bankName;
                disbursement[`disbursement${i + 1}_ifscNum`] = disb.depositAccount.ifscNum;
                disbursement[`disbursement${i + 1}_accountNum`] = disb.depositAccount.accountNum;
                disbursement[`disbursement${i + 1}_accountType`] = disb.depositAccount.accountType;

                totalFixedAmount += Number(currentAmount);
            }
        }

        // If fixed amounts exceed balance (except for specific ownerships), drop it
        if (totalFixedAmount > element.balance && ['gospaze', 'oroproptech'].includes(element.ownership) === false) {
            console.error(
                `Total Fixed Amounts ${totalFixedAmount} is more than the Current Balance ${element.balance}. Please check.`
            );
            return null;
        }

        // Allocate remaining by percentage
        let remainingDisbAmount = element.balance - totalFixedAmount;
        for (let i = 0; i < element.disbursementRules[0].length; i++) {
            const disb = element.disbursementRules[0][i];
            remainingDisbAmount = Math.max(remainingDisbAmount, 0);

            if (!isNaN(disb?.percentage)) {
                const currentAmount = ((remainingDisbAmount * disb.percentage) / 100.0).toFixed(2);
                disbursement[`disbursement${i + 1}_fixedAmount`] = Number(currentAmount);
                disbursement[`disbursement${i + 1}_accountName`] = disb.depositAccount.accountName;
                disbursement[`disbursement${i + 1}_bankName`] = disb.depositAccount.bankName;
                disbursement[`disbursement${i + 1}_ifscNum`] = disb.depositAccount.ifscNum;
                disbursement[`disbursement${i + 1}_accountNum`] = disb.depositAccount.accountNum;
                disbursement[`disbursement${i + 1}_accountType`] = disb.depositAccount.accountType;
            }
        }

        // Construct output with sequential disbursement keys
        const disbursementOut = {
            propertyAddress: element.propertyAddress?.[0],
            escrowAccountNum: element.escrow.accountNum,
            currentBalance: element.balance,
            rent: element.rent,
            disbursedThisMonth: Math.abs(element.disbursedThisMonth),
            ownership: element.ownership,
        };

        let disbCount = 1;
        for (let i = 0; i < element.disbursementRules[0].length; i++) {
            disbursementOut[`disbursement${disbCount}_fixedAmount`] = disbursement[`disbursement${i + 1}_fixedAmount`];
            disbursementOut[`disbursement${disbCount}_accountName`] = disbursement[`disbursement${i + 1}_accountName`];
            disbursementOut[`disbursement${disbCount}_bankName`] = disbursement[`disbursement${i + 1}_bankName`];
            disbursementOut[`disbursement${disbCount}_ifscNum`] = disbursement[`disbursement${i + 1}_ifscNum`];
            disbursementOut[`disbursement${disbCount}_accountNum`] = disbursement[`disbursement${i + 1}_accountNum`];
            disbursementOut[`disbursement${disbCount}_accountType`] = disbursement[`disbursement${i + 1}_accountType`];
            disbCount += 1;
        }

        return disbursementOut;
    });

    return results.filter((element) => element !== null && element !== undefined);
}

module.exports = {
    computeAccountDisbursements,
};

