import {
  App,
  CfnOutput,
  CfnParameter,
  RemovalPolicy,
  Stack,
} from "aws-cdk-lib";
import {
  Bucket,
  BlockPublicAccess,
  BucketEncryption,
} from "aws-cdk-lib/aws-s3";
import { Distribution, ViewerProtocolPolicy } from "aws-cdk-lib/aws-cloudfront";
import { S3BucketOrigin } from "aws-cdk-lib/aws-cloudfront-origins";
import { CfnRuntime } from "aws-cdk-lib/aws-bedrockagentcore";
import { resolve } from "node:path";
import { ROOT } from "../agent/config.ts";

// Offline synthesis only: no lookups, uploads, bootstrap, credentials, or Docker builds.
const app = new App({ outdir: resolve(ROOT, "cdk.out") });
const stack = new Stack(app, "CourtsideSkeleton", {
  env: { region: "us-east-1" },
  terminationProtection: true,
  description:
    "COURTSIDE scaffold; fixture only; requires separately reviewed runtime role and ARM64 image.",
});
const role = new CfnParameter(stack, "RuntimeRoleArn", {
  type: "String",
  description:
    "Existing reviewed AgentCore execution role; no credentials in frontend.",
  allowedPattern: "arn:aws:iam::[0-9]{12}:role/.+",
});
const image = new CfnParameter(stack, "RuntimeImageUri", {
  type: "String",
  description: "Pre-published ARM64 ECR image in us-east-1, pinned by digest.",
  allowedPattern:
    "[0-9]{12}\\.dkr\\.ecr\\.us-east-1\\.amazonaws\\.com/[a-z0-9/_-]+@sha256:[a-f0-9]{64}",
});
const site = new Bucket(stack, "Site", {
  blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
  encryption: BucketEncryption.S3_MANAGED,
  enforceSSL: true,
  versioned: true,
  removalPolicy: RemovalPolicy.RETAIN,
});
const artifacts = new Bucket(stack, "Artifacts", {
  blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
  encryption: BucketEncryption.S3_MANAGED,
  enforceSSL: true,
  versioned: true,
  removalPolicy: RemovalPolicy.RETAIN,
});
const distribution = new Distribution(stack, "Web", {
  defaultRootObject: "index.html",
  defaultBehavior: {
    origin: S3BucketOrigin.withOriginAccessControl(site),
    viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
    compress: true,
  },
});
const runtime = new CfnRuntime(stack, "Agent", {
  agentRuntimeName: "courtside_skeleton",
  roleArn: role.valueAsString,
  agentRuntimeArtifact: {
    containerConfiguration: { containerUri: image.valueAsString },
  },
  protocolConfiguration: "HTTP",
  networkConfiguration: { networkMode: "PUBLIC" },
  environmentVariables: {
    AGENT_PROVIDER: "fixture",
    ALLOW_PAID_MODEL_CALLS: "false",
    AWS_REGION: "us-east-1",
    AWS_PROFILE: "nba",
    AGENT_HOST: "0.0.0.0",
    AGENT_PORT: "8080",
    AGENT_RUNTIME_CONTAINER: "true",
    AGENT_DATA_DIR: "/tmp/courtside",
    FFMPEG_PATH: "/usr/bin/ffmpeg",
  },
});
new CfnOutput(stack, "SiteBucket", { value: site.bucketName });
new CfnOutput(stack, "ArtifactBucket", { value: artifacts.bucketName });
new CfnOutput(stack, "WebDomain", {
  value: distribution.distributionDomainName,
});
new CfnOutput(stack, "RuntimeArn", { value: runtime.attrAgentRuntimeArn });
app.synth();
console.log(
  "Offline CDK template written to cdk.out. No resources deployed; cloud API gateway, IAM role, asset upload and durable job storage remain to be wired.",
);
