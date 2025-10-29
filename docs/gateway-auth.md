# Gateway Auth Examples

Use these examples to verify Google Cloud API Gateway accepts Supabase access tokens from the `Authorization` header.

```bash
curl -i "https://<gateway-host>/api/bookings?uid=<SUPABASE_UID>" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN"
```

A successful response (HTTP 200/4xx from the backend) confirms ESPv2 is validating the Supabase issuer and JWKS. `jwt_authn_access_denied{Jwt_is_missing}` indicates the gateway config still needs to be updated.
