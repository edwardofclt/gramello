import handler from 'vinext/server/fetch-handler';
import { isolateBrowserResponse } from './lib/browser-isolation';
// Framework header rules are not propagated by the pinned compiled Worker.
export default {
  async fetch(request: Request, env: unknown, context: unknown) {
    return isolateBrowserResponse(await handler.fetch(request, env, context));
  },
};
