# Gateway Auth Examples

Use these examples to verify Google Cloud API Gateway accepts the InnerPeace app JWT from either supported header.

## x-app-jwt header

```bash
curl -i "https://<gateway-host>/api/media/list?folderId=<DRIVE_FOLDER>" \
  -H "x-app-jwt: $APP_JWT"
```

## Authorization header

```bash
curl -i "https://<gateway-host>/api/media/list?folderId=<DRIVE_FOLDER>" \
  -H "Authorization: Bearer $APP_JWT"
```

Each request should reach the backend (HTTP 200/4xx from the service). A `jwt_authn_access_denied{Jwt_is_missing}` response indicates the gateway config has not been updated yet.
