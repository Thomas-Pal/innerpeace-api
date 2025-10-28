# Gateway Auth Examples

Use these examples to verify Google API Gateway is forwarding the expected headers to Cloud Run.

## Google Sign-In Path

```bash
curl -i "https://<gw>/api/bookings?uid=100197224540858081628" \
  -H "x-auth-provider: google" \
  -H "x-google-id-token: $GOOGLE_ID_TOKEN" \
  -H "x-app-jwt: $APP_JWT" \
  -H "Authorization: Bearer $APP_JWT"
```

## Apple Sign-In Path

```bash
curl -i "https://<gw>/api/media/list?folderId=XYZ" \
  -H "x-auth-provider: apple" \
  -H "x-apple-identity-token: $APPLE_ID_TOKEN" \
  -H "x-app-jwt: $APP_JWT" \
  -H "Authorization: Bearer $APP_JWT"
```
