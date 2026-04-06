# Background Agents: Open-Inspect

An open-source background agents coding system inspired by
[Ramp's Inspect](https://builders.ramp.com/post/why-we-built-our-background-agent).

## Overview

Open-Inspect provides a hosted background coding agent that can:

- Work on tasks in the background while you focus on other things
- Access full development environments with all tools engineers have
- Support multiple clients (web, Slack, Chrome extension)
- Enable multiplayer sessions where multiple people can collaborate
- Create PRs with proper commit attribution
- Use your choice of AI model — Anthropic Claude or OpenAI Codex via your ChatGPT subscription

## Security Model (Single-Tenant Only)

> **Important**: This system is designed for **single-tenant deployment only**, where all users are
> trusted members of the same organization with access to the same repositories.

### How It Works

The system uses a shared GitHub App installation for all git operations (clone, push). This means:

- **All users share the same GitHub App credentials** - The GitHub App must be installed on your
  organization's repositories, and any user of the system can access any repo the App has access to
- **No per-user repository access validation** - The system does not verify that a user has
  permission to access a specific repository before creating a session
- **User OAuth tokens are used for PR creation** - PRs are created using the user's GitHub OAuth
  token, ensuring proper attribution and that users can only create PRs on repos they have write
  access to

### Token Architecture

| Token Type       | Purpose                | Scope                            |
| ---------------- | ---------------------- | -------------------------------- |
| GitHub App Token | Clone repos, push code | All repos where App is installed |
| User OAuth Token | Create PRs, user info  | Repos user has access to         |
| WebSocket Token  | Real-time session auth | Single session                   |

### Why Single-Tenant Only

This architecture follows
[Ramp's Inspect design](https://builders.ramp.com/post/why-we-built-our-background-agent), which was
built for internal use where all employees are trusted and have access to company repositories.

**For multi-tenant deployment**, you would need:

- Per-tenant GitHub App installations
- Access validation at session creation
- Tenant isolation in the data model

### Deployment Recommendations

1. **Deploy behind your organization's SSO/VPN** - Ensure only authorized employees can access the
   web interface
2. **Install GitHub App only on intended repositories** - The App's installation scope defines what
   the system can access
3. **Use GitHub's repository selection** - When installing the App, select specific repositories
   rather than "All repositories"

## Architecture

```
                                    ┌──────────────────┐
                                    │     Clients      │
                                    │ ┌──────────────┐ │
                                    │ │     Web      │ │
                                    │ │    Slack     │ │
                                    │ │   Extension  │ │
                                    │ └──────────────┘ │
                                    └────────┬─────────┘
                                             │
                                             ▼
┌────────────────────────────────────────────────────────────────────┐
│                     Control Plane (Cloudflare)                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                   Durable Objects (per session)               │  │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌───────────────┐   │  │
│  │  │ SQLite  │  │WebSocket│  │  Event  │  │   GitHub      │   │  │
│  │  │   DB    │  │   Hub   │  │ Stream  │  │ Integration   │   │  │
│  │  └─────────┘  └─────────┘  └─────────┘  └───────────────┘   │  │
│  └──────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │              D1 Database (repo-scoped secrets)                │  │
│  └──────────────────────────────────────────────────────────────┘  │
└────────────────────────────────┬───────────────────────────────────┘
                                 │
                                 ▼
┌────────────────────────────────────────────────────────────────────┐
│                      Data Plane (Modal)                             │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                     Session Sandbox                           │  │
│  │  ┌───────────┐  ┌───────────┐  ┌───────────┐                 │  │
│  │  │ Supervisor│──│  OpenCode │──│   Bridge  │─────────────────┼──┼──▶ Control Plane
│  │  └───────────┘  └───────────┘  └───────────┘                 │  │
│  │                      │                                        │  │
│  │              Full Dev Environment                             │  │
│  │        (Node.js, Python, git, Playwright)                     │  │
│  └──────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
```

## Packages

| Package                                 | Description                          |
| --------------------------------------- | ------------------------------------ |
| [modal-infra](packages/modal-infra)     | Modal sandbox infrastructure         |
| [control-plane](packages/control-plane) | Cloudflare Workers + Durable Objects |
| [web](packages/web)                     | Next.js web client                   |
| [shared](packages/shared)               | Shared types and utilities           |

## Getting Started

For a practical setup guide (local + contributor + deployment paths), start with
**[docs/SETUP_GUIDE.md](docs/SETUP_GUIDE.md)**.

See **[docs/GETTING_STARTED.md](docs/GETTING_STARTED.md)** for deployment instructions.

To understand the architecture and core concepts, read
**[docs/HOW_IT_WORKS.md](docs/HOW_IT_WORKS.md)**.

To set up recurring scheduled tasks, see **[docs/AUTOMATIONS.md](docs/AUTOMATIONS.md)**.

## Key Features

### Fast Startup

Sessions start near-instantly using Modal filesystem snapshots:

- Images rebuilt every 30 minutes with latest code
- Dependencies pre-installed and cached
- Sandboxes warmed proactively when user starts typing

### Multiplayer Sessions

Multiple users can collaborate in the same session:

- Presence indicators show who's active
- Prompts are attributed to their authors in git commits
- Real-time streaming to all connected clients

### Commit Attribution

Commits are attributed to the user who sent the prompt:

```typescript
// Configure git identity per prompt
await configureGitIdentity({
  name: author.scmName,
  email: author.scmEmail,
});
```

### Multi-Provider Model Support

Choose the AI model that fits your task — Anthropic Claude or OpenAI Codex:

| Provider  | Models                                |
| --------- | ------------------------------------- |
| Anthropic | Claude Haiku, Sonnet, Opus            |
| OpenAI    | GPT 5.2, GPT 5.2 Codex, GPT 5.3 Codex |

OpenAI models work with your existing ChatGPT subscription — no separate API key needed. See
**[docs/OPENAI_MODELS.md](docs/OPENAI_MODELS.md)** for setup instructions.

### Repository Lifecycle Scripts

Repositories can define two optional startup scripts under `.openinspect/`:

```bash
# .openinspect/setup.sh (provisioning)
#!/bin/bash
npm install
pip install -r requirements.txt
```

```bash
# .openinspect/start.sh (runtime startup)
#!/bin/bash
docker compose up -d postgres redis
```

- `setup.sh` runs for image builds and fresh sessions
- `setup.sh` is skipped for repo-image and snapshot-restore starts
- `setup.sh` failures are non-fatal for fresh sessions, but fatal in image build mode
- `start.sh` runs for every non-build session startup (fresh, repo-image, snapshot-restore)
- `start.sh` failures are strict: if present and it fails, session startup fails
- Default timeouts:
  - `SETUP_TIMEOUT_SECONDS` (default `300`)
  - `START_TIMEOUT_SECONDS` (default `120`)
- Both hooks receive `OPENINSPECT_BOOT_MODE` (`build`, `fresh`, `repo_image`, `snapshot_restore`)

## License

MIT

## Credits

Inspired by [Ramp's Inspect](https://builders.ramp.com/post/why-we-built-our-background-agent) and
built with:

- [Modal](https://modal.com) - Cloud sandbox infrastructure
- [Cloudflare Workers](https://workers.cloudflare.com) - Edge computing
- [OpenCode](https://opencode.ai) - Coding agent runtime
- [Next.js](https://nextjs.org) - Web framework

what dies tandem need to turn into

0. it needs to look and feel nicer as it does not at the moment
1. need a new suggestions section in the sidebar
2. need to periodically generate ideas and need a way to create and research my own
3. need all agents connected with composio
4. need to get tandem running in tandem
5. need a chat section where you can talk to your mcps
6. need a landing page
7. need sidebar sections

- suggestions
- products
- chats
  - pre populated per integration

9.

Okay, so we're gonna do a bit of a major upgrade to the UI, I'm going to give you a Figma link and
you can use the Figma MCP as well as all of your Figma skills to bring it into line with the design
that I provided. I'm going to go fully through the design and give you details and tell you what to
watch out for. And I'm going to describe it because there's some parts that are illustrated in the
Figma. There are some parts that are not. So... Firstly, let's talk about what you should pay
attention to. Please pay attention to things like spacing and paddings. Please do not pay too much
attention to the way things are arranged in the Figma because I haven't done a good job of grouping
things and stuff like that. I just want you to pay attention to how things are structured visually
and apply that in the best way for a React application. So starting in the top left, we have the
Tandem logo. This is in a Helvetica font. And then underneath it, we have a sidebar. Now you might
need to extrapolate a bit here. It's pretty similar to the existing sidebar we have. So actually, I
probably still want the sidebar open and closed. The Um... I still probably still want the plus
addition button And I... Still want the settings and account icon, although the settings and account
icon can go in the little footer. that I've added in the bottom left. And then as a sort of major
reorganization of how we're doing the sidebar, I still want the ability to search sessions. You can
hide the automations. And also, I don't want this distinction anymore between ideas, products. and
chats. I don't. I think we need that. anymore. or I'll come back, but I want you to keep the notion
of However that's achieved, like the tagging notion, I think we can keep that. Just I don't want the
arrangement in the chat. I just want... There to be two sections. One of them is my work. So this is
everything that was created by me. And then there is organizations or organization. Then we'll just
remove that filter and show everything. But you can see the way things are organized is as an
example, I have like playground project and then I have the names underneath. So I want us to
enforce that every time we create something, Um... It has to have a new branch. And it has to be
given a... Name. And... the branch can be derived from the name so then what would display in the
sidebar is actually His each. repository and you can remove the organization name. So I don't want
to see XYZ slash this. I just want to see the repository name, and then underneath it, I want to see
all of my actual conversations, as the like title of that conversation that I've given it. And
that's what I'm saying we should enforce. So that's the sidebar. And then if you look to the center
of the view, there's nothing in there at the moment. Actually, we are going to... Come back to that
after. So I just want you to leave that there for now. But then on the right hand side of the view,
we have the new chat window. So I want you to pay very special attention to the colors that are
being used. the spacing, border radiuses, effects such as drop shadows, Yeah. And then I want you to
as much as possible look at the design, understand the commonalities. So for example, the button
that says plan and the button with the waveform icon, the button with the arrow icon in the chat
input, Um, All of these are just buttons. So actually what we should be doing here is going into our
design system, updating the button and then using that. These are buttons of size 24 by 24 so we
should make sure that it works. The The logo font is in Helvetica, but the actual font that I'm
using elsewhere, and you should pay attention to font sizes, is the IBM Plex. IBM Plex Mono. I want
you to be able to use that. you Starting from the top of the chat view, we have obviously the
container. Please pay attention to the 24 pixel margin. You can use the use stick to bottom library.
I believe that it's quite good for sticking to the bottom. Then we have this top floating bar with a
background blur in it, and it shows a few things. So on the right-hand side, it's showing At the
moment in the UI, we have this X prompt engineers, and it shows the icons of the prompt engineers.
Here we have the same thing, but in a more square type style. Then on the right-hand side of that
sort of header bar, we have this new display. New display is showing Whether the sandbox itself is
either getting ready or is ready and the ready text I want to be Uh I want the container for that
text to be a fixed width. And if there's too much text, I want it to sort of scroll like a, you
know, like a train, like the things on the tube in London where they kind of scroll across like
that. Um, And then underneath is the memory usage and then a graph of the memory usage. So at the
moment we don't expose that, but what you can do is just add a mock data source from that where we
can keep polling and display that in this sort of in a dot matrix. style basically and when it gets
too high you should Uh, mark the whole thing as Red. Right. So then underneath we have the We have
the users chat messages on the right hand side and the agent chat messages on the left hand side. So
we actually have the code to render these at the moment. It's just the styling and you can I think
include Um, Just for now, include the way that it's formatted already. So I think in the messages we
have like assistant or you or whoever sent the message. Then we have the date time, then we have the
content of the message, and we have execution complete. Um... So yeah, so if that's for the
messages, just make sure it matches the style, the colors, et cetera. Then, in the sort of above the
chat input, we have this other dot matrix. Now, this is just a cool little way of displaying that
the chat is in progress. So whenever we're generating the response, I want to show this little
random do-do-do-do-do-do type waveform here. Um, with a little bit of glow on it. I want it to be a
cool little glow. Then let's have a look at the chat input. The chat input, the design is really
important to get right. So like I said before, please update the system buttons so that they can be
used in this fashion. You might need to create Um... Yeah, you might need to pay attention to the
fact that the icon only buttons Um, They have a six pixel padding all around, whereas the button
with an icon, has a four-pix relative to the text up and down, and then a four pics on the left of
the icon and an eight pics on the right. right of the icon but please use your knowledge of visual
balance in general to understand what is the best to apply here. Then inside the input we have
obviously the text that the user is going to add. We also have the button which should be able to
change the Mode? that open code is using. We then have a voice input button. Don't worry about
actual implementation of that for the moment. And then we have the send button, which I believe we
have already. And you can use the same logic to enable and disable that. you Um... Then we have a
display of which model is being used. And it's thinking level. We also have that in the existing UI.
Then in the bottom right, we have an indication of what the branch is. And we are using for all of
these icons, Lucide icon set. So please install Lucide icon set for React and use that. So please
create a detailed plan. Make sure that each stage that I've mentioned while I've been talking to you
is covered in the plan. And then we will execute on it. After that, we will consider what happens in
the center of the view. I also want you to consider that we have the sidebar. We have the central
view. And we have the left-hand panel, which is the chat. Now, I also want this to function on
mobile. And On mobile, I want this central view is going to be made up of one to N basically tabs
that can be tabbed through. On mobile, I want to have those tabs, plus I want to have a tab for
chat. So you'll be able to see the chat or these other views. Thank you. Yeah. So yeah, that's it.
Please come up with a plan to achieve this. Make sure you understand the existing code base. Make
sure you use your Figma skills.
https://www.figma.com/design/yHzmwv6od7eEBk60VDr1gm/Tandem?node-id=2012-11&t=N24FLruWo3FQOO1R-11
