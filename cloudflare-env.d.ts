declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    AUTH0_DOMAIN?: string;
    AUTH0_CLIENT_ID?: string;
    AUTH0_CLIENT_SECRET?: string;
    AUTH0_SECRET?: string;
    AUTH0_AUDIENCE?: string;
    AUTH0_MOBILE_CLIENT_ID?: string;
    APP_BASE_URL?: string;
  }
}
