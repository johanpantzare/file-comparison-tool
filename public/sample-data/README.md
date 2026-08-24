# Sample Data

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
