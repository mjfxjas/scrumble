# Cost Optimization Implementation

All 8 cost reduction strategies have been implemented. Follow the steps below to activate them.

## Completed (Automatic)

### 1. DynamoDB Provisioned Capacity
- **Changed:** `template.yaml` now uses provisioned capacity (5 RCU/5 WCU)
- **Savings:** Prevents runaway costs from bots/scrapers
- **Action:** Deploy with `./autodeploy.sh`

### 2. Lambda Reserved Concurrency
- **Changed:** `template.yaml` now limits Lambda to 10 concurrent executions
- **Savings:** Caps maximum Lambda cost
- **Action:** Deploy with `./autodeploy.sh`

### 3. Vote Boosting Removed
- **Changed:** `backend/app.py` now shows real vote counts (no +150 boost)
- **Savings:** Smaller numbers = less DynamoDB storage
- **Action:** Deploy with `./autodeploy.sh`

### 4. Cache Headers Optimized
- **Changed:** `autodeploy.sh` now uses 1-year cache for JS/CSS, 1-hour for HTML
- **Savings:** Reduces S3 requests and bandwidth
- **Action:** Automatic on next deploy

---

## 🔧 Manual Setup Required

### 5. CloudFront API Caching (BIGGEST SAVINGS)
**Reduces Lambda calls by 90%**

```bash
# Get your Lambda URL
aws cloudformation describe-stacks --stack-name sam-app \
  --query 'Stacks[0].Outputs[?OutputKey==`FunctionUrl`].OutputValue' \
  --output text

# Run setup script
./scripts/setup_cloudfront_cache.sh https://YOUR_LAMBDA_URL.lambda-url.us-east-1.on.aws
```

**Expected savings:** $5-10/month at 10K visitors/day

---

### 6. Billing Alert
**Get notified when bill exceeds $5**

```bash
./scripts/setup_billing_alert.sh your-email@example.com
```

Check your email and confirm the SNS subscription.

---

### 7. S3 Lifecycle Policy
**Auto-delete old emails after 30 days**

```bash
./scripts/setup_s3_lifecycle.sh
```

---

### 8. Image Compression (Optional)
**Reduce existing images by 50-70%**

```bash
# Install ImageMagick first
brew install imagemagick

# Compress images
./scripts/compress_images.sh

# Upload compressed images
./autodeploy.sh
```

---

## Deployment Order

1. **Deploy infrastructure changes:**
   ```bash
   ./autodeploy.sh
   ```

2. **Setup CloudFront caching** (most important):
   ```bash
   ./scripts/setup_cloudfront_cache.sh https://YOUR_LAMBDA_URL
   ```

3. **Setup billing alert:**
   ```bash
   ./scripts/setup_billing_alert.sh your-email@example.com
   ```

4. **Setup S3 lifecycle:**
   ```bash
   ./scripts/setup_s3_lifecycle.sh
   ```

5. **Compress images** (optional):
   ```bash
   ./scripts/compress_images.sh
   ./autodeploy.sh
   ```

---

## Expected Cost Savings

| Optimization | Monthly Savings (at 10K visitors/day) |
|--------------|---------------------------------------|
| CloudFront caching | $5-10 |
| DynamoDB provisioned | $2-5 |
| Lambda concurrency limit | $0 (prevents spikes) |
| Vote boosting removed | $0.10 |
| Cache headers | $0.50 |
| S3 lifecycle | $0.05 |
| Image compression | $0.20 |
| **Total** | **$8-16/month** |

**Current cost:** ~$0.32/month (no traffic)  
**With optimizations:** ~$2-3/month (1K visitors/day)  
**At scale:** ~$8-12/month (10K visitors/day)

---

## Monitoring

Check your AWS bill:
```bash
aws ce get-cost-and-usage \
  --time-period Start=2025-01-01,End=2025-01-31 \
  --granularity MONTHLY \
  --metrics BlendedCost \
  --group-by Type=SERVICE
```

---

## Rollback

If you need to revert any changes:

1. **DynamoDB back to on-demand:**
   - Edit `template.yaml`: Change `BillingMode: PROVISIONED` to `PAY_PER_REQUEST`
   - Remove `ProvisionedThroughput` section
   - Deploy: `./autodeploy.sh`

2. **Remove Lambda concurrency limit:**
   - Edit `template.yaml`: Remove `ReservedConcurrentExecutions: 10`
   - Deploy: `./autodeploy.sh`

3. **Re-enable vote boosting:**
   - Edit `backend/app.py`: Change `base_boost = 0` to `base_boost = 150`
   - Deploy: `./autodeploy.sh`
