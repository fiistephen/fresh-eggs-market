import crypto from 'node:crypto';
import { inferStatementCategory } from './banking.js';

function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  result.push(current);
  return result.map((value) => value.trim());
}

function parseNaira(value) {
  if (!value) return null;
  const normalized = String(value).replace(/,/g, '').replace(/"/g, '').trim();
  if (!normalized) return null;
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : null;
}

function parseDate(value) {
  if (!value) return null;

  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const [day, month, year] = String(value).trim().split('/');
  if (!day || !month || !year) return null;
  const parsed = new Date(`${year}-${month}-${day}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parsePeriod(line) {
  const match = line.match(/From Date\s+(\d{2}\/\d{2}\/\d{4})\s+To Date\s+(\d{2}\/\d{2}\/\d{4})/i);
  if (!match) return { statementDateFrom: null, statementDateTo: null };

  return {
    statementDateFrom: parseDate(match[1]),
    statementDateTo: parseDate(match[2]),
  };
}

export function buildStatementFingerprint({ bankAccountId, transactionDate, valueDate, direction, debitAmount, creditAmount, description, docNum, runningBalance }) {
  const raw = [
    bankAccountId,
    transactionDate || '',
    valueDate || '',
    direction || '',
    debitAmount ?? '',
    creditAmount ?? '',
    description || '',
    docNum || '',
    runningBalance ?? '',
  ].join('|');

  return crypto.createHash('sha256').update(raw).digest('hex');
}

export function parseProvidusStatement(csvText, { bankAccountId } = {}) {
  if (!csvText || !csvText.trim()) {
    throw new Error('CSV content is required');
  }

  const lines = csvText
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() !== '');

  const metadata = {
    provider: 'PROVIDUS',
    customerName: null,
    accountNumber: null,
    nubanNumber: null,
    statementDateFrom: null,
    statementDateTo: null,
    openingBalance: null,
    closingBalance: null,
  };

  let headerIndex = -1;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const columns = parseCsvLine(line);

    if (columns[0] === 'Customer Name') metadata.customerName = columns[1] || null;
    if (columns[0] === 'Account Number') metadata.accountNumber = columns[1] || null;
    if (columns[0] === 'NUBAN Number') metadata.nubanNumber = columns[1] || null;

    if (line.includes('Statement of Account For  The Period')) {
      const period = parsePeriod(line);
      metadata.statementDateFrom = period.statementDateFrom;
      metadata.statementDateTo = period.statementDateTo;
    }

    if (columns[0] === '' && columns[1] === 'Period Opening Balance ') {
      metadata.openingBalance = parseNaira(columns[3]);
    }
    if (columns[0] === '' && columns[1] === 'Period Closing Balance ') {
      metadata.closingBalance = parseNaira(columns[3]);
    }

    if (
      columns[0] === 'Transaction Date' &&
      columns[1] === 'Actual Transaction Date' &&
      columns[2] === 'Transaction Details'
    ) {
      headerIndex = i;
      break;
    }
  }

  if (headerIndex === -1) {
    throw new Error('Could not locate Providus transaction table header');
  }

  const parsedLines = [];

  for (let i = headerIndex + 1; i < lines.length; i += 1) {
    const rawLine = lines[i];
    const columns = parseCsvLine(rawLine);

    if (!columns.length) continue;
    if (columns[0] === 'DISCLAIMER') break;
    if (columns[0] === '' && columns[1] === '' && columns[2] === 'Total') continue;
    if ((columns[2] || '').includes('Balance B/F')) continue;

    const transactionDate = parseDate(columns[0]);
    const actualTransactionDate = parseDate(columns[1]);
    const description = columns[2] || '';
    const valueDate = parseDate(columns[3]);
    const debitAmount = parseNaira(columns[4]);
    const creditAmount = parseNaira(columns[5]);
    const runningBalance = parseNaira(columns[6]);
    const docNum = columns[8] || null;

    if (!transactionDate || !description) continue;

    const direction = creditAmount != null && creditAmount > 0 ? 'INFLOW' : 'OUTFLOW';
    const suggestedCategory = inferStatementCategory({ direction, description });
    const fingerprint = buildStatementFingerprint({
      bankAccountId,
      transactionDate: transactionDate.toISOString(),
      valueDate: valueDate?.toISOString() || '',
      direction,
      debitAmount,
      creditAmount,
      description,
      docNum,
      runningBalance,
    });

    parsedLines.push({
      lineNumber: parsedLines.length + 1,
      transactionDate,
      actualTransactionDate,
      valueDate,
      description,
      docNum,
      debitAmount,
      creditAmount,
      runningBalance,
      direction,
      suggestedCategory,
      selectedCategory: suggestedCategory,
      reviewStatus: 'READY_TO_POST',
      fingerprint,
      rawPayload: {
        columns,
        rawLine,
      },
    });
  }

  return {
    metadata,
    lines: parsedLines,
    summary: {
      rawRowCount: lines.length,
      parsedRowCount: parsedLines.length,
      openingBalance: metadata.openingBalance,
      closingBalance: metadata.closingBalance,
    },
  };
}
