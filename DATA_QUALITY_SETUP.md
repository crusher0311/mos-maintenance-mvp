# 🔄 DATA QUALITY CRON JOB SETUP

## Overview

The MOS Maintenance MVP includes automated data quality monitoring to keep your customer database clean and accurate.

## Features

### 🔍 **Automated Checks**
- **Orphaned Customers** - Customers without vehicles
- **Incomplete Vehicles** - Missing VIN, year, make, model
- **Invalid VINs** - Not 17 characters
- **Stale Records** - No activity in 90+ days
- **Duplicate Emails** - Multiple customers with same email

### 🧹 **Auto Cleanup Actions**
- Archive inactive customers (180+ days, no vehicles)
- Clean empty VIN fields
- Log all actions for audit trail

## Setup Options

### Option 1: Vercel Cron Jobs (Recommended)

1. **Add to vercel.json:**
```json
{
  "functions": {
    "app/api/cron/data-quality/route.ts": {
      "maxDuration": 60
    }
  },
  "crons": [
    {
      "path": "/api/cron/data-quality",
      "schedule": "0 2 * * *"
    }
  ]
}
```

2. **Set Environment Variables in Vercel:**
```bash
CRON_SECRET=your-secure-random-cron-token-here
AUTO_CLEANUP_ENABLED=false  # Set to true for automatic cleanup
DEFAULT_CUSTOMERS_LIMIT=1000
```

### Option 2: External Cron Service

Use services like EasyCron, cron-job.org, or your own server:

**Cron Expression:** `0 2 * * *` (Daily at 2 AM)
**URL:** `https://your-app.vercel.app/api/cron/data-quality`
**Method:** POST
**Headers:**
```
Authorization: Bearer your-secure-cron-token
Content-Type: application/json
```

### Option 3: GitHub Actions

Create `.github/workflows/data-quality.yml`:

```yaml
name: Data Quality Check
on:
  schedule:
    - cron: '0 2 * * *'  # Daily at 2 AM UTC
  workflow_dispatch:     # Manual trigger

jobs:
  data-quality:
    runs-on: ubuntu-latest
    steps:
      - name: Run Data Quality Check
        run: |
          curl -X POST \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" \
            -H "Content-Type: application/json" \
            https://your-app.vercel.app/api/cron/data-quality
```

## Manual Usage

### Admin Dashboard
Visit `/dashboard/data-quality` to:
- Run manual quality checks
- Preview cleanup actions (dry run)
- Execute cleanup (real actions)
- View detailed issue reports

### API Endpoints

**Run Quality Check:**
```bash
GET /api/admin/data-quality
Authorization: session_token (admin only)
```

**Preview Cleanup:**
```bash
POST /api/admin/data-quality
Content-Type: application/json
{
  "action": "cleanup",
  "dryRun": true
}
```

**Execute Cleanup:**
```bash
POST /api/admin/data-quality
Content-Type: application/json
{
  "action": "cleanup", 
  "dryRun": false
}
```

## Configuration

### Environment Variables

```bash
# Required for cron jobs
CRON_SECRET=your-secure-random-token

# Optional settings
AUTO_CLEANUP_ENABLED=false        # Enable automatic cleanup
DEFAULT_CUSTOMERS_LIMIT=1000      # Limit customers displayed
```

### Cleanup Rules

**Auto-Archive Customers:**
- No vehicles registered
- No activity for 180+ days
- Status not already "archived"

**Data Normalization:**
- Empty VIN strings → null
- Standardize date formats
- Clean whitespace

## Monitoring

### Reports Storage
All quality reports are stored in `data_quality_reports` collection with:
- Timestamp and shop information
- Full issue details and recommendations
- Cleanup actions taken
- Historical trending data

### Logging
Check your application logs for:
- Cron job execution status
- Critical data quality issues
- Cleanup actions performed
- Error details

## Security

### Cron Secret
- Use a strong, random token (32+ characters)
- Store securely in environment variables
- Rotate periodically for security

**Generate secure token:**
```bash
openssl rand -base64 32
```

### Access Control
- Data quality endpoints require admin authentication
- Cron endpoint uses bearer token authentication
- All actions are logged with user/timestamp

## Troubleshooting

### Common Issues

**Cron job not running:**
- Verify `CRON_SECRET` matches in environment and cron service
- Check Vercel function logs for errors
- Ensure URL is correct and accessible

**High memory usage:**
- Adjust `DEFAULT_CUSTOMERS_LIMIT` to process smaller batches
- Consider shop-specific runs for large databases

**False positives:**
- Review cleanup rules in `lib/data-quality.ts`
- Adjust date thresholds for your business needs
- Test with dry runs before enabling auto-cleanup

### Manual Recovery

If auto-cleanup removes needed data:
1. Check `data_quality_reports` collection for action history
2. Restore from database backups if needed
3. Adjust cleanup rules and re-run quality check

## Best Practices

1. **Start with dry runs** to understand impact
2. **Monitor reports** for trending issues
3. **Set appropriate thresholds** for your business
4. **Regular backup** before enabling auto-cleanup
5. **Review logs** after each cron run