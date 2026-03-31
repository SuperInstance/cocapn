# Bill Reminder Plugin

Tracks every bill, subscription, and financial obligation so nothing slips
through the cracks. Tiered reminders, auto-pay tracking, and monthly budget
summaries keep your finances running smoothly.

## What It Does

- **Bill Tracking** — Maintains a complete list of every recurring bill with
  amount, due date, payment method, and linked account. Variable bills (like
  electricity) track expected ranges.
- **Tiered Reminders** — Three-tier reminder system prevents last-minute
  surprises:
  - 7 days before: First reminder with amount and account info
  - 3 days before: Follow-up if not yet marked as paid
  - 1 day before: Urgent reminder for manual-pay items only
- **Auto-Pay Awareness** — Tracks which bills are on auto-pay and which need
  manual action. Only sends urgent reminders for manual bills.
- **Subscription Management** — Tracks all subscriptions with cost, renewal
  frequency, and last-used date. Flags subscriptions for quarterly review.
- **Monthly Budget Summary** — Compares planned spending against actual bills
  paid. Tracks budget utilization by category.
- **Quarterly Subscription Audit** — Every quarter, prompts a full review of
  active subscriptions to identify cancellations and savings opportunities.

## Configuration

Edit the plugin config in `plugin.json`:

```json
{
  "reminderSchedule": {
    "advanceDays": 7,
    "followUpDays": 3,
    "urgentDays": 1,
    "repeatIntervalDays": 3
  },
  "autoPayTracking": true,
  "monthlyBudget": {
    "total": 3200,
    "bufferPercent": 5
  }
}
```

- `advanceDays` — How many days before due date to send the first reminder.
  Default: 7 days. Set to 14 if you prefer more lead time.
- `followUpDays` — When to send the follow-up reminder. Default: 3 days before.
- `urgentDays` — When to escalate to urgent. Default: 1 day before.
- `repeatIntervalDays` — If a bill is still unpaid, how often to re-remind.
  Default: every 3 days.
- `monthlyBudget.total` — Your total monthly budget for bills and expenses.
  Used to calculate utilization percentage.
- `monthlyBudget.bufferPercent` — Percentage of budget held as buffer.
  Default: 5%.

## Default Bills

The template ships with six example bills. Replace these with your actual bills
during setup or through conversation:

| Bill | Amount | Due | Payment | Category |
|------|--------|-----|---------|----------|
| Rent | $1,800 | 1st | Auto-pay | Housing |
| Electric | ~$120 | 5th | Auto-pay | Utilities |
| Internet | $79 | 15th | Auto-pay | Utilities |
| Car Insurance | $189 | 10th | Manual | Insurance |
| Gym | $45 | 25th | Auto-pay | Subscriptions |
| Credit Card | Varies | 20th | Manual | Other |

## Adding Bills

Tell Life Admin about your bills in conversation:

```
You: "I just set up auto-pay for my car insurance. $189 on the 10th
     of every month, paid from my checking account."

Life Admin: "Got it. Car insurance updated:
  - Amount: $189/month
  - Due: 10th of each month
  - Payment: Auto-pay from checking

  I'll still mention it in your weekly summary for awareness,
  but won't send urgent reminders since it's on auto-pay."
```

```
You: "I have a Netflix subscription, $15.99/month, renews on the 8th."

Life Admin: "Added Netflix:
  - Amount: $15.99/month
  - Renewal: 8th of each month
  - Category: Subscription

  Your total monthly subscriptions are now: $60.99
  (Gym $45 + Netflix $15.99)
  Next quarterly audit: April 1"
```

## Reminder Flow

Here is how reminders work for a manual-pay bill due on the 20th:

```
March 13 (7 days before):
  "Upcoming: Credit card payment due March 20.
   I don't have the amount yet — your statement should
   drop around March 12. Want me to check in about it?"

March 17 (3 days before):
  "Reminder: Credit card payment is due in 3 days.
   Amount: $847.20 (from your statement).
   Payment method: Manual — need to schedule this."

March 19 (1 day before):
  "URGENT: Credit card payment of $847.20 due TOMORROW.
   Please schedule the payment today to avoid late fees."
```

For auto-pay bills, only the first gentle reminder is sent:

```
March 4 (7 days before):
  "Heads up: Rent ($1,800) auto-pays from checking on the 1st.
   Just confirming the funds will be there."
```

## Monthly Budget Summary

On the 1st of each month, Life Admin generates a budget summary:

```
March Budget Summary

FIXED EXPENSES (auto-pay)
  Rent:           $1,800   [PAID]
  Electric:       $134     [PAID]
  Internet:       $79      [PAID]
  Gym:            $45      [PAID]

MANUAL PAYMENTS
  Car insurance:  $189     [PAID Mar 8]
  Credit card:    $847.20  [PAID Mar 18]

TOTAL PAID:      $3,094.20
BUDGET:          $3,200.00
REMAINING:       $105.80 (3.3%)

Status: On track. Budget utilization at 97%.
        Everything paid on time this month.
```

## Quarterly Subscription Audit

Every quarter (January, April, July, October), Life Admin runs a full
subscription review:

```
Quarterly Subscription Audit — April 2026

ACTIVE SUBSCRIPTIONS:
  Gym membership       $45/mo    Last used: Mar 28    [ESSENTIAL]
  Netflix              $16/mo    Last used: Mar 26    [VALUABLE]
  Spotify              $11/mo    Last used: Mar 22    [VALUABLE]
  New York Times       $17/mo    Last used: Feb 14    [NICE-TO-HAVE]
  Cloud storage        $3/mo     Last used: Mar 30    [ESSENTIAL]
  Learning platform    $29/mo    Last used: Jan 8     [FORGOTTEN]

TOTAL: $121/month ($1,452/year)

RECOMMENDATIONS:
  - Learning platform: Not used in 82 days. Cancel?
    Potential savings: $348/year
  - NYT: Low usage. Consider switching to free tier?
    Potential savings: $204/year

  Total potential savings: $552/year

  Want me to cancel the learning platform subscription?"
```

## Data Storage

Bill and subscription data is stored in `cocapn/memory/bills.json` within your
private brain repo. Financial data never leaves your local machine and is
committed to Git for history and backup. No bank account access required —
you provide the numbers, Life Admin handles the tracking and reminding.
