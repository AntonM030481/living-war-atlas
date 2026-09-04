import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJsonPath = path.join(root, "package.json");
const webVersionPath = path.join(root, "public", "version.json");
const iosProjectPath = path.join(root, "ios", "App", "App.xcodeproj", "project.pbxproj");

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: options.inherit ? "inherit" : ["ignore", "pipe", "pipe"],
  });
}

function git(args) {
  return run("git", args).trim();
}

async function getVersionInfo() {
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
  const version = packageJson.version;

  if (!/^\d+\.\d+\.\d+(?:[-+].+)?$/.test(version)) {
    throw new Error(`Invalid package version: ${version}`);
  }

  const isShallow = git(["rev-parse", "--is-shallow-repository"]) === "true";
  if (isShallow && !process.env.APP_BUILD_NUMBER) {
    throw new Error(
      "Full Git history is required for the build number. Run `git fetch --unshallow` or set APP_BUILD_NUMBER explicitly.",
    );
  }

  const buildText = process.env.APP_BUILD_NUMBER ?? git(["rev-list", "--count", "HEAD"]);
  const build = Number.parseInt(buildText, 10);
  if (!Number.isSafeInteger(build) || build < 1) {
    throw new Error(`Invalid build number: ${buildText}`);
  }

  const commit = (
    process.env.APP_COMMIT_SHA ??
    process.env.GITHUB_SHA ??
    git(["rev-parse", "--short=7", "HEAD"])
  ).slice(0, 7);
  const dirty = git(["status", "--porcelain", "--untracked-files=no"]) !== "";

  return {
    version,
    build,
    commit,
    dirty,
    label: `${version} (${build}) ${commit}${dirty ? "-dirty" : ""}`,
  };
}

async function writeWebVersion(info) {
  await mkdir(path.dirname(webVersionPath), { recursive: true });
  await writeFile(
    webVersionPath,
    `${JSON.stringify(
      {
        version: info.version,
        build: info.build,
        commit: info.commit,
        dirty: info.dirty,
        label: info.label,
      },
      null,
      2,
    )}\n`,
  );
  console.log(`Web version: ${info.label}`);
}

async function syncIosVersion(info) {
  const project = await readFile(iosProjectPath, "utf8");
  const marketingPattern = /MARKETING_VERSION = [^;]+;/g;
  const buildPattern = /CURRENT_PROJECT_VERSION = [^;]+;/g;

  const marketingMatches = project.match(marketingPattern)?.length ?? 0;
  const buildMatches = project.match(buildPattern)?.length ?? 0;
  if (marketingMatches === 0 || buildMatches === 0) {
    throw new Error("Could not find iOS version build settings in project.pbxproj");
  }

  const updated = project
    .replace(marketingPattern, `MARKETING_VERSION = ${info.version};`)
    .replace(buildPattern, `CURRENT_PROJECT_VERSION = ${info.build};`);

  if (updated !== project) {
    await writeFile(iosProjectPath, updated);
  }

  console.log(`iOS version: ${info.version} (${info.build})`);
}

async function deploy(info) {
  if (info.dirty) {
    throw new Error("Refusing to deploy tracked uncommitted changes. Commit or stash them first.");
  }

  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";

  run(npm, ["run", "build"], { inherit: true });

  const freshInfo = await getVersionInfo();
  if (freshInfo.dirty) {
    throw new Error("Build changed tracked files; refusing to deploy an unidentifiable artifact.");
  }

  run(
    npx,
    [
      "wrangler",
      "deploy",
      "--tag",
      `v${freshInfo.version}-${freshInfo.build}`,
      "--message",
      freshInfo.label,
    ],
    { inherit: true },
  );
}

const args = new Set(process.argv.slice(2));
const info = await getVersionInfo();

if (args.has("--write-web")) {
  await writeWebVersion(info);
} else if (args.has("--sync-ios")) {
  await syncIosVersion(info);
} else if (args.has("--deploy")) {
  await deploy(info);
} else {
  console.log(info.label);
}
