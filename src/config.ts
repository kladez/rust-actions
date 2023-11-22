import fs from "fs";

import * as core from "@actions/core";
import type { WebhookEvent } from "@octokit/webhooks-types";

interface Context {
  token?: string;
  owner: string;
  repository: string;
  event: WebhookEvent;
  sha: string;
}

class Config {
  isDebug: boolean;
  args: string;
  context: Context;

  constructor() {
    this.isDebug = core.isDebug();

    this.args = core.getInput("args");

    const [owner, repository] = process.env["GITHUB_REPOSITORY"]!.split("/");

    const event = JSON.parse(fs.readFileSync(process.env["GITHUB_EVENT_PATH"]!, "utf8")) as WebhookEvent;

    this.context = {
      token: core.getInput("github_token") || undefined,
      owner,
      repository,
      event,
      sha: process.env["GITHUB_SHA"]!,
    };
  }
}

export const config = new Config();
