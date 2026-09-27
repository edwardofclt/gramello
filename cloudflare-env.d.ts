declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    APP_BASE_URL?: string;
    USDA_API_KEY?: string;
    OFF_SEARCH_ENABLED?: string;
  }
}
