# Innerpeace API

This service is an Express application that loads configuration from environment variables using [`dotenv`](https://github.com/motdotla/dotenv). When you run the server locally it automatically looks for a `.env` file at the project root (`/workspace/innerpeace-api/.env`).

## Setting environment variables

1. Copy the sample file and fill in the values that apply to your deployment:
   ```bash
   cp .env.example .env
   ```
2. Edit `.env` and populate the required secrets. The Google Drive private key must keep the literal `\n` newlines when stored in a single-line `.env` entry.
3. Start the API (`npm run dev` or `npm run start`). The file is loaded automatically by `server/index.ts` via `import 'dotenv/config'`.

> **Note**
> If you deploy to Cloud Run or another managed environment, set the same variables in the service configuration instead of using a `.env` file.

### Google Drive media proxy values

The Google Drive integration expects the following variables:

| Variable | Description |
| --- | --- |
| `DRIVE_SA_CLIENT_EMAIL` | Service account email that has access to your Drive media folder. |
| `DRIVE_SA_PRIVATE_KEY` | Private key for the service account. Keep escaped newlines (`\n`) when storing in `.env`. |
| `DRIVE_DEFAULT_FOLDER_ID` | Optional. Default Drive folder ID to use when clients omit `?folderId=`. |
| `DRIVE_LIST_CACHE_SECONDS` | Optional. Cache duration (seconds) for `/api/drive/list` responses. |

Any other configuration (Calendar delegation, port, etc.) can also live in the same `.env` file; see `.env.example` for the full list.
