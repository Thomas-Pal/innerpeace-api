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
2. Edit `.env` and populate the required secrets. The Google Drive private key must keep the literal `\n` newlines when stored in a single-line `.env` entry. You can create an additional `.env.local` to override any values for your machine; it is loaded automatically in development.
3. Start the API (`npm run dev` or `npm run start`). Environment files are loaded automatically by `server/config/loadEnv.ts` when the process boots.

> **Note**
> If you deploy to Cloud Run or another managed environment, set the same variables in the service configuration instead of using a `.env` file.

### Google integrations

The backend now talks to Google APIs exclusively through a dedicated Service Account. Configure the following variables for both local development and Cloud Run:

| Variable | Description |
| --- | --- |
| `GOOGLE_PROJECT_ID` | Google Cloud project ID that owns the Service Account. |
| `GOOGLE_SA_EMAIL` | Service Account email with access to Calendar and Drive. |
| `GOOGLE_SA_KEY` | Private key for the Service Account. Accepts the raw PEM (with `\n`) or a base64-encoded blob. |
| `DRIVE_MEDIA_FOLDER_ID` | Default Drive folder ID to use when clients omit `?folderId=`. |
| `MEDIA_ALLOWED_MIME` | Optional. Comma-separated MIME allowlist (defaults to `video/*,audio/*`). |
| `MEDIA_CACHE_MAX_AGE` | Optional. Value for the `Cache-Control` header when streaming media. |

### Authentication configuration

API requests are authenticated with the InnerPeace app JWT. Set the issuer, audience, and JWKS endpoint so both the gateway and backend validate the same tokens:

| Variable | Description |
| --- | --- |
| `APP_JWT_ISSUER` | Issuer claim expected in app JWTs (default `https://innerpeace.app`). |
| `APP_JWT_AUDIENCE` | Audience claim expected in app JWTs (default `innerpeace-app`). |
| `APP_JWKS_URI` | Optional override for the JWKS endpoint. Defaults to `<issuer>/.well-known/jwks.json`. |
| `APP_JWT_PRIVATE_KEY_PEM` | PKCS#8 PEM used to mint first-party app tokens. |
| `APP_JWT_PUBLIC_JWK` | Public JWK published at `/.well-known/jwks.json` for verifiers (safe to share). |
| `APP_JWT_KID` | Key ID advertised in minted tokens and JWKS responses. |

## API Gateway authentication

Protected endpoints are fronted by Google Cloud API Gateway. The OpenAPI definition in `infra/gateway/openapi-google.yaml` now defines an `app_jwt` security scheme that reads tokens from either the `x-app-jwt` header or the `Authorization: Bearer` header.

The API publishes its signing keys at `/.well-known/jwks.json` and exposes `POST /auth/mint` for clients that need to exchange a federated identity for an Innerpeace app JWT. Ensure the same issuer domain fronts both endpoints so Cloud API Gateway can fetch the JWKS.

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

### Quick verification

After deploying the new config, confirm that both header styles reach the backend:

```bash
curl -i "$GATEWAY_HOST/api/media/list?folderId=test" \
  -H "x-app-jwt: $APP_JWT"

curl -i "$GATEWAY_HOST/api/media/list?folderId=test" \
  -H "Authorization: Bearer $APP_JWT"
```

Either request should return the backend response (HTTP 200/4xx). A `jwt_authn_access_denied{Jwt_is_missing}` error indicates the gateway config still needs to be updated.
