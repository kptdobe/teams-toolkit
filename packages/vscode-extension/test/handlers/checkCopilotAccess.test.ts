import * as sinon from "sinon";
import * as vscode from "vscode";

import { err, Inputs, ok } from "@microsoft/teamsfx-api";
import * as tools from "@microsoft/teamsfx-core/build/common/tools";
import * as core from "@microsoft/teamsfx-core";

import M365TokenInstance from "../../src/commonlib/m365Login";
import * as handlers from "../../src/handlers";
import VsCodeLogInstance from "../../src/commonlib/log";
import { checkCopilotAccessHandler } from "../../src/handlers/checkCopilotAccess";

describe("check copilot access", () => {
  const sandbox = sinon.createSandbox();

  beforeEach(() => {});

  afterEach(() => {
    sandbox.restore();
  });

  it("check copilot access in walkthrough: not signed in && with access", async () => {
    const copilotCheckServiceScope = process.env.SIDELOADING_SERVICE_SCOPE ?? core.serviceScope;
    const m365GetStatusStub = sandbox
      .stub(M365TokenInstance, "getStatus")
      .withArgs({ scopes: core.AppStudioScopes })
      .resolves(err({ error: "unknown" } as any));
    const m365GetAccessTokenStub = sandbox
      .stub(M365TokenInstance, "getAccessToken")
      .withArgs({ scopes: [copilotCheckServiceScope] })
      .resolves(ok("stubedString"));

    const getCopilotStatusStub = sandbox.stub(tools, "getCopilotStatus").resolves(true);

    const showMessageStub = sandbox.stub(vscode.window, "showInformationMessage").resolves({
      title: "Sign in",
    } as vscode.MessageItem);

    const signInM365Stub = sandbox.stub(vscode.commands, "executeCommand").resolves();

    const semLogStub = sandbox.stub(VsCodeLogInstance, "semLog").resolves();

    await checkCopilotAccessHandler();

    sandbox.assert.calledOnce(m365GetStatusStub);
    sandbox.assert.calledOnce(showMessageStub);
    sandbox.assert.calledOnce(signInM365Stub);
    sandbox.assert.calledOnce(m365GetAccessTokenStub);
    sandbox.assert.calledOnce(getCopilotStatusStub);
    sandbox.assert.calledOnce(semLogStub);
  });

  it("check copilot access in walkthrough: not signed in && no access", async () => {
    const copilotCheckServiceScope = process.env.SIDELOADING_SERVICE_SCOPE ?? core.serviceScope;
    const m365GetStatusStub = sandbox
      .stub(M365TokenInstance, "getStatus")
      .withArgs({ scopes: core.AppStudioScopes })
      .resolves(err({ error: "unknown" } as any));
    const m365GetAccessTokenStub = sandbox
      .stub(M365TokenInstance, "getAccessToken")
      .withArgs({ scopes: [copilotCheckServiceScope] })
      .resolves(ok("stubedString"));

    const getCopilotStatusStub = sandbox.stub(tools, "getCopilotStatus").resolves(false);

    const showMessageStub = sandbox.stub(vscode.window, "showInformationMessage").resolves({
      title: "Sign in",
    } as vscode.MessageItem);

    const signInM365Stub = sandbox.stub(vscode.commands, "executeCommand").resolves();

    const semLogStub = sandbox.stub(VsCodeLogInstance, "semLog").resolves();

    await checkCopilotAccessHandler();

    sandbox.assert.calledOnce(m365GetStatusStub);
    sandbox.assert.calledOnce(showMessageStub);
    sandbox.assert.calledOnce(signInM365Stub);
    sandbox.assert.calledOnce(m365GetAccessTokenStub);
    sandbox.assert.calledOnce(getCopilotStatusStub);
    sandbox.assert.calledOnce(semLogStub);
  });

  it("check copilot access in walkthrough: signed in && no access", async () => {
    const copilotCheckServiceScope = process.env.SIDELOADING_SERVICE_SCOPE ?? core.serviceScope;
    const m365GetStatusStub = sandbox
      .stub(M365TokenInstance, "getStatus")
      .withArgs({ scopes: core.AppStudioScopes })
      .resolves(ok({ status: "SignedIn", accountInfo: { upn: "test.email.com" } }));
    const m365GetAccessTokenStub = sandbox
      .stub(M365TokenInstance, "getAccessToken")
      .withArgs({ scopes: [copilotCheckServiceScope] })
      .resolves(ok("stubedString"));

    const getCopilotStatusStub = sandbox.stub(tools, "getCopilotStatus").resolves(false);

    const showMessageStub = sandbox.stub(vscode.window, "showInformationMessage").resolves({
      title: "Sign in",
    } as vscode.MessageItem);

    const signInM365Stub = sandbox.stub(vscode.commands, "executeCommand").resolves();

    const semLogStub = sandbox.stub(VsCodeLogInstance, "semLog").resolves();

    await checkCopilotAccessHandler();

    sandbox.assert.calledOnce(m365GetStatusStub);
    sandbox.assert.notCalled(showMessageStub);
    sandbox.assert.notCalled(signInM365Stub);
    sandbox.assert.calledOnce(m365GetAccessTokenStub);
    sandbox.assert.calledOnce(getCopilotStatusStub);
    sandbox.assert.calledOnce(semLogStub);
  });

  it("check copilot access in walkthrough: signed in && with access", async () => {
    const copilotCheckServiceScope = process.env.SIDELOADING_SERVICE_SCOPE ?? core.serviceScope;
    const m365GetStatusStub = sandbox
      .stub(M365TokenInstance, "getStatus")
      .withArgs({ scopes: core.AppStudioScopes })
      .resolves(ok({ status: "SignedIn", accountInfo: { upn: "test.email.com" } }));
    const m365GetAccessTokenStub = sandbox
      .stub(M365TokenInstance, "getAccessToken")
      .withArgs({ scopes: [copilotCheckServiceScope] })
      .resolves(ok("stubedString"));

    const getCopilotStatusStub = sandbox.stub(tools, "getCopilotStatus").resolves(true);

    const showMessageStub = sandbox.stub(vscode.window, "showInformationMessage").resolves({
      title: "Sign in",
    } as vscode.MessageItem);

    const signInM365Stub = sandbox.stub(vscode.commands, "executeCommand").resolves();

    const semLogStub = sandbox.stub(VsCodeLogInstance, "semLog").resolves();

    await checkCopilotAccessHandler();

    sandbox.assert.calledOnce(m365GetStatusStub);
    sandbox.assert.notCalled(showMessageStub);
    sandbox.assert.notCalled(signInM365Stub);
    sandbox.assert.calledOnce(m365GetAccessTokenStub);
    sandbox.assert.calledOnce(getCopilotStatusStub);
    sandbox.assert.calledOnce(semLogStub);
  });
});
