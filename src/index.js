/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      return new Response("Unsupported content type", { status: 415 });
    }

    const pathSecret = request.url.split("/").pop();
    if (pathSecret !== env.WEBHOOK_SECRET) {
      return new Response("Unauthorized", { status: 401 });
    }

    try {
      const json = await request.json();

      // doesn't give us real json for some reason
      if (
        !(
          json.body.includes("Paperless") &&
          json.body.includes("authorized_application")
        )
      ) {
        return new Response(null, { status: 204 });
      }

      const username = json.event_user_username;

      const resp = await fetch(env.API_URL + "/users/", {
        method: "GET",
        headers: {
          Authorization: "Token " + env.PAPERLESS_API_TOKEN,
        },
      });

      const users = await resp.json();

      // find user matching username
      const user = users.results.find((user) => user.username === username);

      if (!user.groups.includes(1)) {
        const resp = await fetch(env.API_URL + "/users/" + user.id + "/", {
          method: "PATCH",
          headers: {
            Authorization: "Token " + env.PAPERLESS_API_TOKEN,
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ groups: [...user.groups, "1"] }),
        });
        console.log(await resp.json());

        if (!resp.ok) {
          return new Response("Error updating user", { status: 500 });
        } else {
          return new Response("User updated", { status: 200 });
        }
      }

      return new Response("JSON received and processed", { status: 200 });
    } catch (err) {
      console.log(err);
      return new Response("Error processing request", { status: 500 });
    }
  },
};
