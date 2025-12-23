'use strict';

const {
  OwnershipExpenseAccount,
  OwnershipDisbursementAccount,
} = require('realtimatecommon/common/disbursement_accounts');

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
    const ownerExpenseAccount = OwnershipExpenseAccount[element.ownership];
    if (!ownerExpenseAccount) {
      throw new Error('Did not find the ownership expense account for ' + element.ownership);
    }

    const disbursement = {};
    let maxDisbursementIndex = 0;
    var alreadyDisbursedForTheMonth = false;

    // Skip if already disbursed >80% of rent and over threshold
    if (
      Math.abs(element.amountDisbursedThisMonth) >= 1000 &&
      Math.abs(element.amountDisbursedThisMonth) > element.rent * 0.8
    ) {
      console.log(
        `${element.escrow.accountNum}: Already disbursed ${element.amountDisbursedThisMonth} of rent ${element.rent} this month. Skipping...`
      );
      alreadyDisbursedForTheMonth = true;
    }

    // First accumulate fixed amounts (add GST for PMS account when taxesExtra is true)
    let totalFixedAmount = 0;
    for (let i = 0; i < element.disbursementRules[0].length; i++) {
      const disb = element.disbursementRules[0][i];
      if (!isNaN(disb?.fixedAmount)) {
        let currentAmount = alreadyDisbursedForTheMonth ? 0 : disb.fixedAmount;
        if (disb.depositAccount.accountNum === ownerPMSDisbAccount?.accountNumber && disb.taxesExtra) {
          currentAmount = (currentAmount * 1.18).toFixed(2); // Including GST
          currentAmount = Math.ceil(currentAmount); // round up
        }
        const idx = i + 1;
        disbursement[`disbursement${idx}_fixedAmount`] = Number(currentAmount);
        disbursement[`disbursement${idx}_accountName`] = disb.depositAccount.accountName;
        disbursement[`disbursement${idx}_bankName`] = disb.depositAccount.bankName;
        disbursement[`disbursement${idx}_ifscNum`] = disb.depositAccount.ifscNum;
        disbursement[`disbursement${idx}_accountNum`] = disb.depositAccount.accountNum;
        disbursement[`disbursement${idx}_accountType`] = disb.depositAccount.accountType ?? 'savings';

        if (disb.depositAccount.accountNum === ownerPMSDisbAccount?.accountNumber) {
          disbursement[`disbursement${idx}_disbursementType`] = 'PMS Fee';
        } else {
          disbursement[`disbursement${idx}_disbursementType`] = 'Rent';
        }

        totalFixedAmount += Number(currentAmount);
        maxDisbursementIndex = Math.max(maxDisbursementIndex, idx);
      }
    }

    // Next, create a separate disbursement for each expense to the ownership expense account
    let totalExpenses = 0;
    if (Array.isArray(element.expenses)) {
      // expenses may be stored as [ [ ... ] ] or [ ... ]
      const rawExpenses =
        Array.isArray(element.expenses[0]) && element.expenses.length === 1 ? element.expenses[0] : element.expenses;
      for (const exp of rawExpenses) {
        if (!isNaN(exp?.amount)) {
          const amount = alreadyDisbursedForTheMonth ? 0 : Number(exp.amount);
          totalExpenses += amount;
          const idx = maxDisbursementIndex + 1;
          disbursement[`disbursement${idx}_fixedAmount`] = amount;
          disbursement[`disbursement${idx}_accountName`] = ownerExpenseAccount.accountName;
          disbursement[`disbursement${idx}_bankName`] = ownerExpenseAccount.bankName;
          disbursement[`disbursement${idx}_ifscNum`] = ownerExpenseAccount.ifscNum;
          disbursement[`disbursement${idx}_accountNum`] = ownerExpenseAccount.accountNumber;
          disbursement[`disbursement${idx}_accountType`] = ownerExpenseAccount.accountType ?? 'current';
          disbursement[`disbursement${idx}_disbursementType`] = 'Expense';

          totalFixedAmount += amount;
          maxDisbursementIndex = idx;
        }
      }
    }

    // If fixed amounts (including expenses) exceed balance (except for specific ownerships), drop it
    if (totalFixedAmount > element.balance && ['gospaze', 'oroproptech'].includes(element.ownership) === false) {
      console.error(
        `Total Fixed Amounts ${totalFixedAmount} is more than the Current Balance ${element.balance}. Please check.`
      );
      return null;
    }

    // Allocate remaining by percentage (after fixed amounts and expenses)
    let remainingDisbAmount = element.balance - totalFixedAmount;
    for (let i = 0; i < element.disbursementRules[0].length; i++) {
      const disb = element.disbursementRules[0][i];
      remainingDisbAmount = Math.max(remainingDisbAmount, 0);

      if (!isNaN(disb?.percentage)) {
        const currentAmount = alreadyDisbursedForTheMonth
          ? 0
          : ((remainingDisbAmount * disb.percentage) / 100.0).toFixed(2);
        const idx = i + 1;
        disbursement[`disbursement${idx}_fixedAmount`] = Number(currentAmount);
        disbursement[`disbursement${idx}_accountName`] = disb.depositAccount.accountName;
        disbursement[`disbursement${idx}_bankName`] = disb.depositAccount.bankName;
        disbursement[`disbursement${idx}_ifscNum`] = disb.depositAccount.ifscNum;
        disbursement[`disbursement${idx}_accountNum`] = disb.depositAccount.accountNum;
        disbursement[`disbursement${idx}_accountType`] = disb.depositAccount.accountType ?? 'savings';

        if (disb.depositAccount.accountNum === ownerPMSDisbAccount?.accountNumber) {
          disbursement[`disbursement${idx}_disbursementType`] = 'PMS Fee';
        } else {
          disbursement[`disbursement${idx}_disbursementType`] = 'Rent';
        }

        maxDisbursementIndex = Math.max(maxDisbursementIndex, idx);
      }
    }

    // Construct output with disbursements array instead of numbered fields
    const disbursementOut = {
      propertyAddress: element.propertyAddress?.[0],
      escrowAccountNum: element.escrow.accountNum,
      currentBalance: element.balance,
      rent: element.rent,
      alreadyDisbursedForTheMonth: alreadyDisbursedForTheMonth ? '✅' : '⏳',
      amountDisbursedThisMonth: Math.abs(element.amountDisbursedThisMonth),
      ownership: element.ownership,
      disbursements: [],
    };

    for (let i = 0; i < maxDisbursementIndex; i++) {
      const fixedAmount = disbursement[`disbursement${i + 1}_fixedAmount`];
      // Only push entries that have an amount computed
      if (fixedAmount !== undefined && fixedAmount !== null) {
        disbursementOut.disbursements.push({
          fixedAmount,
          accountName: disbursement[`disbursement${i + 1}_accountName`],
          bankName: disbursement[`disbursement${i + 1}_bankName`],
          ifscNum: disbursement[`disbursement${i + 1}_ifscNum`],
          accountNum: disbursement[`disbursement${i + 1}_accountNum`],
          accountType: disbursement[`disbursement${i + 1}_accountType`],
          disbursementType: disbursement[`disbursement${i + 1}_disbursementType`],
        });
      }
    }

    return disbursementOut;
  });

  return results.filter((element) => element !== null && element !== undefined);
}

module.exports = {
  computeAccountDisbursements,
};
