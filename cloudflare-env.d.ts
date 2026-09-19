declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    AUTH0_DOMAIN?: string;
    AUTH0_CLIENT_ID?: string;
    AUTH0_CLIENT_SECRET?: string;
    AUTH0_SECRET?: string;
    APP_BASE_URL?: string;
  }
}
