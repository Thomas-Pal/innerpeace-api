# Innerpeace API

This service is an Express application that loads configuration from environment variables using [`dotenv`](https://github.com/motdotla/dotenv). When you run the server locally it automatically looks for a `.env` file at the project root (`/workspace/innerpeace-api/.env`).

## Setting environment variables

1. Copy the example file and fill in the values that apply to your deployment:
   ```bash
   cp .env.example .env
   ```
   You can also start from the production defaults if you prefer:
   ```bash
   cp .env.prod .env
   ```
2. Edit `.env` and populate the required secrets. The Google Drive private key must keep the literal `\n` newlines when stored in a single-line `.env` entry.
3. Start the API (`npm run dev` or `npm run start`). The file is loaded automatically by `server/index.ts` via `import 'dotenv/config'`.

> **Note**
> If you deploy to Cloud Run or another managed environment, set the same variables in the service configuration instead of using a `.env` file.

### Google Drive media proxy values

The Google Drive integration expects the following variables:

| Variable | Description |
| --- | --- |
| `DRIVE_MEDIA_FOLDER_ID` | Default Drive folder ID to use when clients omit `?folderId=`. |
| `MEDIA_ALLOWED_MIME` | Optional. Comma-separated MIME allowlist (defaults to `video/*,audio/*`). |
| `MEDIA_CACHE_MAX_AGE` | Optional. Value for the `Cache-Control` header when streaming media. |

Any other configuration (Calendar delegation, port, etc.) can also live in the same `.env` file; see `.env.prod` for the full list.

### Authentication configuration

The authentication middleware verifies Google and Apple ID tokens against the `GOOGLE_OAUTH_CLIENT_ID` and `APPLE_AUDIENCE_BUNDLE_ID` environment variables. Set these to the client ID (Google) and bundle/service ID (Apple) used by your mobile apps. For local session JWTs, configure `SESSION_JWT_SECRET`.

## API Gateway authentication

Protected endpoints are fronted by Google Cloud API Gateway. The OpenAPI definition in `infra/gateway/openapi-google.yaml` trusts ID tokens from **either** Google Sign-In or Apple Sign In:

- `google_id_token` validates tokens issued by `https://accounts.google.com` against the Drive & Calendar web client IDs.
- `apple_id_token` validates tokens issued by `https://appleid.apple.com` for the iOS bundle ID (`com.innerpeace.app`). It also accepts tokens delivered either via the `Authorization: Bearer <token>` header or the `x-apple-identity-token` header so the native app can keep its current request shape.

To roll out changes, update the API config and redeploy the gateway:

```bash
CONFIG_ID=innerpeace-config-$(date +%Y%m%d%H%M)

gcloud api-gateway api-configs create "$CONFIG_ID" \
  --api=innerpeace-api \
  --openapi-spec=infra/gateway/openapi-google.yaml \
  --project=$PROJECT_ID

gcloud api-gateway gateways update innerpeace-gateway \
  --api=innerpeace-api \
  --api-config="$CONFIG_ID" \
  --location=europe-west2 \
  --project=$PROJECT_ID
```

If you add new Google client IDs or Apple bundle/service IDs, update both the OpenAPI audiences and the middleware environment variables before redeploying.

### Quick verification

```bash
# Apple token via Authorization header
curl -i "$GATEWAY_HOST/api/media/list?folderId=test" \
  -H "x-auth-provider: apple" \
  -H "Authorization: Bearer $APPLE_ID_TOKEN"

# Apple token via x-apple-identity-token
curl -i "$GATEWAY_HOST/api/media/list?folderId=test" \
  -H "x-auth-provider: apple" \
  -H "x-apple-identity-token: $APPLE_ID_TOKEN"

# Google ID token
curl -i "$GATEWAY_HOST/api/media/list?folderId=test" \
  -H "Authorization: Bearer $GOOGLE_ID_TOKEN"
```

Each command should return `200` when using a valid token.
