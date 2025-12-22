'use strict';

const path = require('path');
const ExcelJS = require('exceljs');

/**
 * Generate an Excel file for the given accountDisbursements.
 *
 * - One row per disbursement.
 * - Common account-level fields are merged vertically so that sorting/filtering
 *   keeps all disbursements for an account together visually.
 *
 * @param {Array} accountDisbursements - Output from computeAccountDisbursements()
 * @param {Object} [options]
 * @param {string} [options.outputPath] - Full path for the XLSX file. Defaults to /tmp/disbursements-<timestamp>.xlsx
 * @returns {Promise<{ filePath: string, rowCount: number, accountCount: number }>}
 */
async function generateDisbursementsExcel(accountDisbursements = [], options = {}) {
  if (!Array.isArray(accountDisbursements)) {
    throw new Error('generateDisbursementsExcel expected accountDisbursements to be an array');
  }

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Disbursements');

  // Define columns
  worksheet.columns = [
    { header: 'Escrow Account #', key: 'escrowAccountNum', width: 18 },
    { header: 'Property Address', key: 'propertyAddress', width: 30 },
    { header: 'Current Balance', key: 'currentBalance', width: 16 },
    { header: 'Rent', key: 'rent', width: 12 },
    { header: 'Disbursed This Month', key: 'disbursedThisMonth', width: 20 },
    { header: 'Ownership', key: 'ownership', width: 16 },
    { header: 'Disbursement Amount', key: 'fixedAmount', width: 18 },
    { header: 'Disbursement Type', key: 'disbrsementType', width: 18 },
    { header: 'Beneficiary Name', key: 'accountName', width: 24 },
    { header: 'Bank Name', key: 'bankName', width: 20 },
    { header: 'IFSC', key: 'ifscNum', width: 14 },
    { header: 'Beneficiary Account #', key: 'accountNum', width: 22 },
    { header: 'Beneficiary Account Type', key: 'accountType', width: 22 },
  ];

  // Bold header row
  worksheet.getRow(1).font = { bold: true };

  // Add rows, tracking ranges for each account so we can merge common fields
  let accountCount = 0;
  for (const account of accountDisbursements) {
    const disbursements = Array.isArray(account.disbursements) ? account.disbursements : [];
    if (disbursements.length === 0) {
      continue;
    }

    accountCount += 1;
    const startRow = worksheet.rowCount + 1;

    for (const disb of disbursements) {
      worksheet.addRow({
        escrowAccountNum: account.escrowAccountNum,
        propertyAddress: account.propertyAddress,
        currentBalance: account.currentBalance,
        rent: account.rent,
        disbursedThisMonth: account.disbursedThisMonth,
        fixedAmount: disb.fixedAmount,
        disbrsementType: disb.disbrsementType,
        accountName: disb.accountName,
        bankName: disb.bankName,
        ifscNum: disb.ifscNum,
        accountNum: disb.accountNum,
        accountType: disb.accountType,
      });
    }

    const endRow = worksheet.rowCount;

    // Merge common cells vertically for this account
    if (endRow > startRow) {
      const colsToMerge = [
        'A', // escrowAccountNum
        'B', // propertyAddress
        'C', // currentBalance
        'D', // rent
        'E', // disbursedThisMonth
        'F', // ownership
      ];

      for (const col of colsToMerge) {
        worksheet.mergeCells(`${col}${startRow}:${col}${endRow}`);
      }
    }
  }

  const outputPath =
    options.outputPath ||
    path.join('/tmp', options.fileName || `disbursements-${new Date().toISOString().replace(/[:.]/g, '-')}.xlsx`);

  await workbook.xlsx.writeFile(outputPath);

  const rowCount = Math.max(worksheet.rowCount - 1, 0); // exclude header

  console.log(`Generated disbursements Excel at ${outputPath} with ${rowCount} rows for ${accountCount} accounts.`);

  return {
    filePath: outputPath,
    rowCount,
    accountCount,
  };
}

module.exports = {
  generateDisbursementsExcel,
};
