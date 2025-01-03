/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.toml`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

import { Configuration, EventsApi } from "@goauthentik/api";
interface RequestBody {
  body: string;
  severity: string;
  user_email: string;
  user_username: string;
  event_user_email: string;
  event_user_username: string;
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const pathSecret = request.url.split("/").pop();
    if (pathSecret !== env.WEBHOOK_SECRET) {
      return new Response("Unauthorized", { status: 401 });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    if (request.headers.get("content-type") !== "application/json") {
      return new Response("Content type must be application/json", {
        status: 400,
      });
    }

    const body = (await request.json()) as RequestBody;

    const exp = /\'request_id\':\s'([^\']+)'/;

    // try to match
    let match;
    try {
      match = body.body.match(exp);
      if (!match) {
        return new Response("No request_id found in body", { status: 400 });
      }
    } catch (e) {
      return new Response("Error parsing body", { status: 400 });
    }

    const request_id = match[0];

    const config = new Configuration({
      basePath: env.AUTHENTIK_URL,
      apiKey: env.AUTHENTIK_API_KEY,
    });

    const api = new EventsApi(config);

    try {
      const events = await api.eventsEventsList({
        contextAuthorizedApp: "Paperless",
        pageSize: 10,
      });

      const event = events.results.find(
        (event) => event.context.http_request.request_id === request_id
      );

      if (!event) {
        return new Response("Not a Paperless event", { status: 400 });
      }

      const username =
        event?.user?.on_behalf_of?.username || event?.user?.username;

      // paperless section

      const resp = await fetch(env.PAPERLESS_URL + "/users/", {
        method: "GET",
        headers: {
          Authorization: `Token ${env.PAPERLESS_API_TOKEN}`,
        },
      });

      const users = (await resp.json()) as any;
      const user = users.results.find(
        (user: { username: string }) => user.username === username
      );

      // add permissions to user we found

      if (user.groups.includes(1)) {
        return new Response("User already has permissions", { status: 200 });
      }

      const respp = await fetch(env.PAPERLESS_URL + `/users/${user.id}/`, {
        method: "PATCH",
        headers: {
          Authorization: `Token ${env.PAPERLESS_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          groups: [...user.groups, 1],
        }),
      });

      if (respp.ok) {
        return new Response("User permissions updated", { status: 200 });
      }
    } catch (e) {
      console.error(e);
      return new Response("Error updating user permissions e", { status: 500 });
    }

    return new Response("Error updating user permissions", { status: 500 });
  },
} satisfies ExportedHandler<Env>;
