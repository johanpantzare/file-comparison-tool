import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outputDir = resolve(here, '../public/sample-data');

const companies = [
  { organization: 'Nordic Equipment Group', department: 'Sales North', country: 'Sweden', parmaId: 'P731204' },
  { organization: 'Fjord Machines Group', department: 'Sales West', country: 'Norway', parmaId: 'P184920' },
  { organization: 'Bau Technik Holdings', department: 'Sales Central', country: 'Germany', parmaId: 'P642118' },
  { organization: 'Pieces Service Group', department: 'Aftermarket', country: 'France', parmaId: 'P295731' },
  { organization: 'Great Lakes Rental', department: 'Rental', country: 'United States', parmaId: 'P807443' },
  { organization: 'Britannia Plant Services', department: 'Training', country: 'United Kingdom', parmaId: 'P516082' },
  { organization: 'Delta Connected Services', department: 'Digital Services', country: 'Netherlands', parmaId: 'P409675' },
  { organization: 'Iberia Dealer Network', department: 'Dealer Support', country: 'Spain', parmaId: 'P920114' },
  { organization: 'Alpina Support Group', department: 'Product Support', country: 'Italy', parmaId: 'P358706' },
  { organization: 'Brasil Accounts Group', department: 'Key Accounts', country: 'Brazil', parmaId: 'P674219' },
  { organization: 'Baltic Field Services', department: 'Field Service', country: 'Estonia', parmaId: 'P247806' },
  { organization: 'Maple Heavy Equipment', department: 'Regional Sales', country: 'Canada', parmaId: 'P803162' },
  { organization: 'Pacific Site Solutions', department: 'Site Support', country: 'Australia', parmaId: 'P469350' },
  { organization: 'Andes Construction Partners', department: 'Dealer Development', country: 'Chile', parmaId: 'P582941' },
  { organization: 'Sakura Machine Works', department: 'Product Support', country: 'Japan', parmaId: 'P390526' },
  { organization: 'Atlas Earthmoving', department: 'Mining Accounts', country: 'South Africa', parmaId: 'P718634' },
  { organization: 'Vistula Equipment', department: 'Sales East', country: 'Poland', parmaId: 'P235497' },
  { organization: 'Douro Plant Hire', department: 'Rental', country: 'Portugal', parmaId: 'P849205' },
  { organization: 'Anatolia Dealer Services', department: 'Dealer Support', country: 'Turkey', parmaId: 'P604738' },
  { organization: 'Han River Machinery', department: 'Key Accounts', country: 'South Korea', parmaId: 'P976051' },
];

const branchCities = [
  'Stockholm', 'Bergen', 'Hamburg', 'Lyon', 'Chicago', 'Bristol', 'Rotterdam', 'Madrid', 'Milano', 'Curitiba',
  'Uppsala', 'Oslo', 'Munich', 'Nantes', 'Detroit', 'Leeds', 'Eindhoven', 'Valencia', 'Turin', 'Recife',
  'Tallinn', 'Toronto', 'Sydney', 'Santiago', 'Osaka', 'Cape Town', 'Warsaw', 'Porto', 'Ankara', 'Busan',
];

const firstNames = [
  'Ava', 'Liam', 'Mia', 'Noah', 'Emma', 'Oscar', 'Sofia', 'Lucas', 'Ella', 'Hugo',
  'Nora', 'Leo', 'Alma', 'Felix', 'Clara', 'Milo', 'Freja', 'Elias', 'Lina', 'Theo',
];

const lastNames = [
  'Andersson', 'Berg', 'Carter', 'Dahl', 'Eriksson', 'Fischer', 'Garcia', 'Holm',
  'Ivanov', 'Johansson', 'Kim', 'Larsen', 'Muller', 'Nordin', 'Olsen', 'Patel',
  'Quinn', 'Rossi', 'Silva', 'Turner', 'Usman', 'Vega', 'Wang', 'Young', 'Zimmer',
];

const jobTitles = ['Sales Manager', 'Technician', 'Trainer', 'Coordinator', 'Analyst', 'Support Specialist'];
const personalBranches = Array.from({ length: 100 }, (_, index) => makeBranch(index, 'B'));

const personalRows = [];
for (let index = 0; index < 1000; index += 1) {
  const branchIndex = Math.floor(index / 10);
  const branch = personalBranches[branchIndex];
  const firstName = firstNames[index % firstNames.length];
  const lastName = lastNames[(index * 7) % lastNames.length];
  const userNumber = String(index + 1).padStart(4, '0');

  personalRows.push({
    'User ID': `U${userNumber}`,
    Name: `${firstName} ${lastName} ${userNumber}`,
    Email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}${userNumber}@example.com`,
    Department: branch.department,
    'PARMA ID': branch.parmaId,
    'Branch ID': branch.branchId,
    Dealer: branch.dealer,
    Country: branch.country,
    'Job Title': jobTitles[index % jobTitles.length],
    'Start Date': dateFromIndex(index),
  });
}

const requiredParticipantRows = personalRows.slice(0, 80).map((person, index) => ({
  'Participant ID': person['User ID'],
  Name: person.Name,
  Email: person.Email,
  Dealer: person.Dealer,
  Country: person.Country,
  Role: person['Job Title'],
  'Required Session': ['Opening briefing', 'Safety training', 'Product workshop', 'Final assessment'][index % 4],
  Priority: index % 9 === 0 ? 'High' : 'Normal',
}));

const registeredParticipantRows = [
  ...requiredParticipantRows.map((person, index) => ({
    'Registration ID': `R${String(index + 1).padStart(4, '0')}`,
    'Participant ID': person['Participant ID'],
    Name: person.Name,
    Email: person.Email,
    Dealer: person.Dealer,
    Country: person.Country,
    'Badge Status': index % 6 === 0 ? 'Printed' : 'Ready',
    'Arrival Date': dateFromIndex(index + 60),
    'Consent Status': index % 11 === 0 ? 'Pending' : 'Confirmed',
    Source: 'Registration portal',
  })),
  ...personalRows.slice(120, 130).map((person, index) => ({
    'Registration ID': `R${String(900 + index).padStart(4, '0')}`,
    'Participant ID': person['User ID'],
    Name: person.Name,
    Email: person.Email,
    Dealer: person.Dealer,
    Country: person.Country,
    'Badge Status': 'Ready',
    'Arrival Date': dateFromIndex(index + 260),
    'Consent Status': 'Confirmed',
    Source: 'Optional attendee',
  })),
];

const referenceRows = personalBranches.map((branch, index) => {
  return {
    'PARMA ID': branch.parmaId,
    'Branch ID': branch.branchId,
    'Organization Name': branch.organization,
    'Branch Name': branch.branchName,
    Region: regionForCountry(branch.country),
    Country: branch.country,
    'Sales 2025': 250000 + index * 1175,
    'Sales 2026': 280000 + index * 1290,
    Currency: branch.country === 'United States' || branch.country === 'Brazil' ? 'USD' : 'EUR',
    Segment: ['Construction', 'Mining', 'Rental', 'Roads'][index % 4],
  };
});

const branchInsightRows = personalBranches.map((branch, index) => ({
  'PARMA ID': branch.parmaId,
  'Branch ID': branch.branchId,
  'Training Region': regionForCountry(branch.country),
  'Support Tier': ['Platinum', 'Gold', 'Silver', 'Bronze'][index % 4],
  'Customer Success Owner': `${firstNames[(index * 3) % firstNames.length]} ${lastNames[(index * 5) % lastNames.length]}`,
  'Priority Score': 42 + ((index * 11) % 58),
  'Last Audit Date': dateFromIndex(index + 400),
  'Open Cases': (index * 7) % 13,
  'Certification Rate': `${72 + (index % 26)}%`,
  Notes: ['Stable', 'Needs follow-up', 'New branch', 'High training demand'][index % 4],
}));

const complianceRows = personalBranches.map((branch, index) => ({
  'PARMA ID': branch.parmaId,
  'Branch ID': branch.branchId,
  'Compliance Status': ['Approved', 'Approved', 'Review needed', 'Pending'][index % 4],
  'Risk Level': ['Low', 'Medium', 'Low', 'High'][index % 4],
  'Contract Renewal': dateFromIndex(index + 730),
  'Data Sharing Agreement': index % 5 === 0 ? 'Missing' : 'Signed',
  'Last Safety Review': dateFromIndex(index + 520),
  'Required Courses': 8 + (index % 6),
  'Completed Courses': 6 + (index % 7),
  'Audit Owner': `${firstNames[(index * 4) % firstNames.length]} ${lastNames[(index * 6) % lastNames.length]}`,
}));

mkdirSync(outputDir, { recursive: true });
writeCsv(resolve(outputDir, 'Personal.csv'), personalRows);
writeCsv(resolve(outputDir, 'RequiredParticipants.csv'), requiredParticipantRows);
writeCsv(resolve(outputDir, 'RegisteredParticipants.csv'), registeredParticipantRows);
writeCsv(resolve(outputDir, 'ParmaReference.csv'), referenceRows);
writeCsv(resolve(outputDir, 'BranchInsights.csv'), branchInsightRows);
writeCsv(resolve(outputDir, 'ComplianceRecords.csv'), complianceRows);
const { messyPersonalRows, messyReferenceRows } = makeMessySample(personalRows, referenceRows);
const {
  messyRequiredParticipantRows,
  messyRegisteredParticipantRows,
} = makeMessyCoverageParticipants(requiredParticipantRows, registeredParticipantRows, personalRows);
const messyBranchInsightRows = makeMessyBranchInsights(branchInsightRows);
const messyComplianceRows = makeMessyComplianceRecords(complianceRows);
writeCsv(resolve(outputDir, 'PersonalMessy.csv'), messyPersonalRows);
writeCsv(resolve(outputDir, 'RequiredParticipantsMessy.csv'), messyRequiredParticipantRows);
writeCsv(resolve(outputDir, 'RegisteredParticipantsMessy.csv'), messyRegisteredParticipantRows);
writeCsv(resolve(outputDir, 'ParmaReferenceMessy.csv'), messyReferenceRows);
writeCsv(resolve(outputDir, 'BranchInsightsMessy.csv'), messyBranchInsightRows);
writeCsv(resolve(outputDir, 'ComplianceRecordsMessy.csv'), messyComplianceRows);
writeFileSync(resolve(outputDir, 'README.md'), sampleReadme(), 'utf8');

function writeCsv(path, rows) {
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(',')),
  ];
  writeFileSync(path, `${lines.join('\n')}\n`, 'utf8');
}

function csvEscape(value) {
  const text = String(value ?? '');
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function makeBranch(index, prefix) {
  const company = companies[index % companies.length];
  const city = branchCities[index % branchCities.length];
  const branchNumber = Math.floor(index / companies.length) + 1;
  const branchId = `${prefix}${company.parmaId.slice(1, 4)}-${String(branchNumber).padStart(3, '0')}`;
  const branchName = `${company.organization} ${city} Branch ${branchNumber}`;

  return {
    parmaId: company.parmaId,
    branchId,
    dealer: company.organization,
    branchName,
    organization: company.organization,
    department: company.department,
    country: company.country,
  };
}

function regionForCountry(country) {
  if (['Sweden', 'Norway', 'United Kingdom', 'Netherlands'].includes(country)) return 'Europe North';
  if (['Germany', 'France', 'Spain', 'Italy', 'Estonia', 'Poland', 'Portugal', 'Turkey'].includes(country)) return 'Europe Central';
  if (['United States', 'Canada'].includes(country)) return 'North America';
  if (['Brazil', 'Chile'].includes(country)) return 'Latin America';
  if (['Japan', 'South Korea'].includes(country)) return 'Asia Pacific';
  if (country === 'Australia') return 'Oceania';
  if (country === 'South Africa') return 'Africa';
  return 'Global';
}

function dateFromIndex(index) {
  const date = new Date(Date.UTC(2024 + (index % 3), index % 12, (index % 27) + 1));
  return date.toISOString().slice(0, 10);
}

function makeMessySample(cleanPersonalRows, cleanReferenceRows) {
  const messyPersonalRows = cleanPersonalRows.map((row) => ({ ...row }));
  const messyReferenceRows = cleanReferenceRows.map((row) => ({ ...row }));

  const personalDealerTyposByBranch = new Map([
    ['B409-001', 'Delta Connected Servcies'],
    ['B920-001', 'Iberia Dealer Netwrk'],
    ['B358-001', 'Alpina Suport Group'],
    ['B674-001', 'Brasil Account Group'],
  ]);

  messyPersonalRows.forEach((row, index) => {
    const dealerTypo = personalDealerTyposByBranch.get(row['Branch ID']);
    if (dealerTypo) row.Dealer = dealerTypo;
    if ([24, 137, 411, 876].includes(index)) row.Email = '';
    if ([58, 212, 633].includes(index)) row.Country = '';
    if ([99, 501, 777].includes(index)) row['Start Date'] = '';
  });

  const referenceOrganizationTypos = new Map([
    ['B731-001', 'Nordic Equipmnt Group'],
    ['B184-001', 'Fjord Machine Group'],
    ['B642-001', ''],
    ['B295-001', 'Pieces Services Group'],
    ['B807-001', 'great lakes rental'],
    ['B516-001', 'Britannia Plant Service'],
  ]);

  messyReferenceRows.forEach((row, index) => {
    const organizationTypo = referenceOrganizationTypos.get(row['Branch ID']);
    if (organizationTypo !== undefined) row['Organization Name'] = organizationTypo;
    if ([12, 44, 78].includes(index)) row['Sales 2026'] = '';
    if ([16, 62].includes(index)) row['Branch Name'] = '';
    if (index === 31) row.Currency = '';
  });

  const removedBranchIds = new Set(['B235-005', 'B849-005', 'B604-005', 'B976-005', 'B731-005']);
  const referenceWithMissingBranches = messyReferenceRows.filter((row) => !removedBranchIds.has(row['Branch ID']));

  const extraReferenceBranches = personalBranches.slice(0, 5).map((branch, index) => ({
    'PARMA ID': branch.parmaId,
    'Branch ID': `X${branch.parmaId.slice(1, 4)}-${String(index + 1).padStart(3, '0')}`,
    'Organization Name': branch.organization,
    'Branch Name': `${branch.organization} Extra Branch ${index + 1}`,
    Region: regionForCountry(branch.country),
    Country: branch.country,
    'Sales 2025': 125000 + index * 5000,
    'Sales 2026': index === 2 ? '' : 135000 + index * 5500,
    Currency: branch.country === 'United States' || branch.country === 'Brazil' ? 'USD' : 'EUR',
    Segment: ['Construction', 'Mining', 'Rental', 'Roads', 'Construction'][index],
  }));

  return {
    messyPersonalRows,
    messyReferenceRows: [...referenceWithMissingBranches, ...extraReferenceBranches],
  };
}

function makeMessyCoverageParticipants(cleanRequiredRows, cleanRegisteredRows, sourcePeopleRows) {
  const messyRequiredParticipantRows = cleanRequiredRows.map((row) => ({ ...row }));
  const messyRegisteredParticipantRows = cleanRegisteredRows.map((row) => ({ ...row }));

  messyRequiredParticipantRows[7]['Participant ID'] = '';
  messyRequiredParticipantRows[18]['Participant ID'] = cleanRequiredRows[17]['Participant ID'];
  messyRequiredParticipantRows[33].Email = '';
  messyRequiredParticipantRows[44].Dealer = 'Nordic Equipmnt Group';
  messyRequiredParticipantRows[62].Priority = '';

  const removedParticipantIds = new Set(['U0024', 'U0041', 'U0068']);
  let filteredRegisteredRows = messyRegisteredParticipantRows.filter(
    (row) => !removedParticipantIds.has(row['Participant ID']),
  );

  const duplicateRegistration = {
    ...filteredRegisteredRows.find((row) => row['Participant ID'] === 'U0012'),
    'Registration ID': 'R0991',
    Source: 'Manual duplicate',
  };
  filteredRegisteredRows.push(duplicateRegistration);

  filteredRegisteredRows = filteredRegisteredRows.map((row, index) => {
    if (row['Participant ID'] === 'U0036') return { ...row, Email: '' };
    if (row['Participant ID'] === 'U0050') return { ...row, 'Consent Status': '' };
    if (index === 9) return { ...row, 'Badge Status': 'Prnted' };
    return row;
  });

  const referenceOnlyRows = sourcePeopleRows.slice(180, 184).map((person, index) => ({
    'Registration ID': `R${String(990 + index).padStart(4, '0')}`,
    'Participant ID': person['User ID'],
    Name: person.Name,
    Email: person.Email,
    Dealer: person.Dealer,
    Country: person.Country,
    'Badge Status': index === 1 ? '' : 'Ready',
    'Arrival Date': dateFromIndex(index + 480),
    'Consent Status': 'Confirmed',
    Source: 'Reference-only registration',
  }));

  return {
    messyRequiredParticipantRows,
    messyRegisteredParticipantRows: [...filteredRegisteredRows, ...referenceOnlyRows],
  };
}

function makeMessyBranchInsights(cleanRows) {
  const messyRows = cleanRows.map((row) => ({ ...row }));

  messyRows.forEach((row, index) => {
    if ([6, 22, 41, 73].includes(index)) row['Customer Success Owner'] = '';
    if ([9, 18, 64].includes(index)) row['Last Audit Date'] = '';
    if ([11, 49, 88].includes(index)) row['Certification Rate'] = '';
    if ([14, 52].includes(index)) row['Support Tier'] = 'Goldd';
    if ([27, 81].includes(index)) row.Notes = 'Needs followup';
    if ([33, 67].includes(index)) row['Open Cases'] = '';
  });

  const removedBranchIds = new Set(['B247-005', 'B803-005', 'B469-005']);
  const rowsWithMissingBranches = messyRows.filter((row) => !removedBranchIds.has(row['Branch ID']));
  const extraBranches = personalBranches.slice(10, 13).map((branch, index) => ({
    'PARMA ID': branch.parmaId,
    'Branch ID': `I${branch.parmaId.slice(1, 4)}-${String(index + 1).padStart(3, '0')}`,
    'Training Region': regionForCountry(branch.country),
    'Support Tier': ['Gold', 'Silver', 'Bronze'][index],
    'Customer Success Owner': `${firstNames[(index + 4) % firstNames.length]} ${lastNames[(index + 9) % lastNames.length]}`,
    'Priority Score': 55 + index * 9,
    'Last Audit Date': index === 1 ? '' : dateFromIndex(index + 900),
    'Open Cases': index + 2,
    'Certification Rate': `${80 + index}%`,
    Notes: index === 2 ? 'Unmatched sample branch' : 'Extra insight row',
  }));

  return [...rowsWithMissingBranches, ...extraBranches];
}

function makeMessyComplianceRecords(cleanRows) {
  const messyRows = cleanRows.map((row) => ({ ...row }));

  messyRows.forEach((row, index) => {
    if ([3, 29, 71].includes(index)) row['Compliance Status'] = 'Aproved';
    if ([8, 38, 84].includes(index)) row['Risk Level'] = '';
    if ([15, 55].includes(index)) row['Data Sharing Agreement'] = 'Unsigned';
    if ([20, 43, 92].includes(index)) row['Last Safety Review'] = '';
    if ([34, 69].includes(index)) row['Completed Courses'] = '';
    if ([47, 77].includes(index)) row['Audit Owner'] = '';
  });

  const removedBranchIds = new Set(['B390-005', 'B718-005', 'B582-005', 'B920-004']);
  const rowsWithMissingBranches = messyRows.filter((row) => !removedBranchIds.has(row['Branch ID']));
  const extraBranches = personalBranches.slice(14, 18).map((branch, index) => ({
    'PARMA ID': branch.parmaId,
    'Branch ID': `C${branch.parmaId.slice(1, 4)}-${String(index + 1).padStart(3, '0')}`,
    'Compliance Status': ['Pending', 'Review needed', 'Approved', 'Pending'][index],
    'Risk Level': ['Medium', 'High', '', 'Low'][index],
    'Contract Renewal': index === 2 ? '' : dateFromIndex(index + 1280),
    'Data Sharing Agreement': index === 1 ? 'Missing' : 'Signed',
    'Last Safety Review': dateFromIndex(index + 1110),
    'Required Courses': 9 + index,
    'Completed Courses': index === 3 ? '' : 5 + index,
    'Audit Owner': `${firstNames[(index + 8) % firstNames.length]} ${lastNames[(index + 13) % lastNames.length]}`,
  }));

  return [...rowsWithMissingBranches, ...extraBranches];
}

function sampleReadme() {
  return `# Sample Data

Use these files to test the file comparison tool.

## Files

- Personal.csv: 1,000 fictional users with 10 columns.
- RequiredParticipants.csv: 80 fictional required attendees for coverage testing.
- RegisteredParticipants.csv: 90 fictional registrations, including all required attendees and optional attendees.
- ParmaReference.csv: 100 fictional company/branch reference rows with 10 columns.
- BranchInsights.csv: 100 fictional branch insight rows with 10 columns, intended as an extra reference file.
- ComplianceRecords.csv: 100 fictional compliance lookup rows with 10 columns, intended as a third reference file.
- PersonalMessy.csv: 1,000 fictional users with the same columns, plus spelling issues and blank non-key cells.
- RequiredParticipantsMessy.csv: 80 required attendees with blank keys, duplicate keys, and missing-registration cases.
- RegisteredParticipantsMessy.csv: registrations with duplicates, reference-only rows, and messy fields.
- ParmaReferenceMessy.csv: 100 fictional company/branch reference rows with the same columns, plus spelling issues, blank cells, missing branches, and extra branches.
- BranchInsightsMessy.csv: 100 fictional branch insight rows with blanks, spelling variations, missing branches, and extra branches.
- ComplianceRecordsMessy.csv: 100 fictional compliance lookup rows with blanks, spelling variations, missing branches, and extra branches.

## Suggested Setup

Original file:
- Personal.csv

New file:
- ParmaReference.csv

Match rows:
- Personal PARMA ID = ParmaReference PARMA ID
- Personal Branch ID = ParmaReference Branch ID

Compare:
- Personal Dealer = ParmaReference Organization Name

Add columns:
- From ParmaReference.csv: Region, Sales 2025, Sales 2026, Currency, Segment
- From BranchInsights.csv: Support Tier, Customer Success Owner, Priority Score, Last Audit Date, Open Cases, Certification Rate, Notes
- From ComplianceRecords.csv: Compliance Status, Risk Level, Contract Renewal, Data Sharing Agreement, Last Safety Review, Required Courses, Completed Courses, Audit Owner

## Expected App Results

These two files are intentionally in sync. With PARMA ID + Branch ID as the match, and Dealer compared to Organization Name, the visible KPI counts should be:

- Different: 0
- Only in new: 0
- Missing in new: 0
- Same: 100 matched branches

The 100 same branches cover all 1,000 Personal.csv users, because each branch has 10 users. The duplicate matching warning is expected on Personal.csv and simply means there are multiple users connected to the same company branch.

There are 20 company-level PARMA IDs. Each company can have multiple branches, and each branch has its own Branch ID. If an Organization Name repeats, it should repeat with the same PARMA ID.

## Coverage Check Setup

Primary list:
- RequiredParticipants.csv

Reference population:
- RegisteredParticipants.csv

Match population:
- RequiredParticipants Participant ID = RegisteredParticipants Participant ID

With the clean coverage files, the primary list has 80 required participants and the reference population has 90 registrations. All 80 required participants should be found exactly once, while the 10 optional registrations appear as reference-only rows.

For a messy coverage check, use RequiredParticipantsMessy.csv as the primary list and RegisteredParticipantsMessy.csv as the reference population. The messy files include a blank primary key, a duplicate primary key, missing registrations, one duplicated registration, and reference-only registrations.

## Advanced Coverage Setup

Primary list:
- ParmaReference.csv

Reference population:
- Personal.csv

Match population:
- ParmaReference PARMA ID = Personal PARMA ID
- ParmaReference Branch ID = Personal Branch ID

This advanced setup checks branch coverage against a larger people population. Each primary branch should match 10 reference rows, so Group summary is useful for reviewing one-to-many coverage.

## Messy Sample Setup

Original file:
- PersonalMessy.csv

New file:
- ParmaReferenceMessy.csv

Match rows:
- PersonalMessy PARMA ID = ParmaReferenceMessy PARMA ID
- PersonalMessy Branch ID = ParmaReferenceMessy Branch ID

Compare:
- PersonalMessy Dealer = ParmaReferenceMessy Organization Name

## Expected Messy App Results

With the default comparison options, the visible KPI counts should be:

- Different: 10 matched branches
- Only in new: 5 rows
- Missing in new: 50 rows
- Same: 85 matched branches

The messy files include:

- 10 matched branches where Dealer and Organization Name differ because of spelling, casing, or blanks.
- 5 reference branches that do not exist in PersonalMessy.csv.
- 5 personal branches, covering 50 users, that do not exist in ParmaReferenceMessy.csv.
- Blank Email, Country, Start Date, Branch Name, Sales 2026, and Currency cells to test filtering, enrichment, and protection behavior.

## Additional Reference File Setup

In Build enriched table mode, add a third reference file card and load BranchInsights.csv.

Match rows:
- Personal PARMA ID = BranchInsights PARMA ID
- Personal Branch ID = BranchInsights Branch ID

Add columns:
- Support Tier
- Customer Success Owner
- Priority Score
- Last Audit Date
- Open Cases
- Certification Rate
- Notes

With the clean files, BranchInsights.csv is also fully in sync with Personal.csv. With BranchInsightsMessy.csv, three branch keys are missing from the insight file and three extra insight rows do not exist in Personal.

For a fourth file in the same flow, add another reference card and load ComplianceRecords.csv.

Match rows:
- Personal PARMA ID = ComplianceRecords PARMA ID
- Personal Branch ID = ComplianceRecords Branch ID

Add columns:
- Compliance Status
- Risk Level
- Contract Renewal
- Data Sharing Agreement
- Last Safety Review
- Required Courses
- Completed Courses
- Audit Owner

With the clean files, ComplianceRecords.csv is fully in sync with Personal.csv. With ComplianceRecordsMessy.csv, four branch keys are missing from the compliance file and four extra compliance rows do not exist in Personal.
`;
}
