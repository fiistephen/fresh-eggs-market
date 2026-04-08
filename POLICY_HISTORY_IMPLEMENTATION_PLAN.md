# Policy History Implementation Plan

## Goal

Make company policy editable in Admin without rewriting history.

When policy changes:
- new work uses the new policy
- older records keep the policy that was active when they were created

## Policies Covered

- Target profit per crate
- Crack allowance percent
- Allowable cracked crates
- Allowable written-off crates
- Minimum booking payment percent
- First-time customer booking limit
- Maximum booking size per order
- Large POS payment alert threshold

## Implementation Parts

1. Policy history model
- Store policy versions as a time-ordered history
- Each saved change gets an `effectiveFrom` timestamp
- Current policy is the latest entry whose `effectiveFrom` is in the past

2. Current-rule workflows
- Booking, portal, banking allocation, and alerts use the current policy at action time
- This means a rule change affects only work done after the change

3. Historical batch and inventory reporting
- Batch analysis, batch list/detail, inventory control, and batch reports resolve policy using the batch start date
- This keeps old batches from being re-scored by a newer policy

4. Admin UX
- Expand Admin beyond 2 policy fields
- Show the current policy fields clearly
- Show policy history so staff can see when a rule changed
- Explain that new saves apply from now onward only

5. Validation and rollout
- Validate locally
- Deploy to staging
- Confirm:
  - Admin save creates a new policy version
  - Old batches still show old policy comparisons
  - New bookings and portal bookings use the updated rules

## Notes

- The cracked-crate and written-off-crate limits are optional fixed caps. If left blank, the app still uses the percentage rule.
- Historical policy is most important for batch profit and crack/write-off monitoring.
- Customer-facing and staff booking rules use the latest saved policy at the moment the action is taken.
