import { App, Stack, CfnOutput, CfnParameter, RemovalPolicy, Tags, Duration } from "aws-cdk-lib";
import { Bucket, BlockPublicAccess, BucketEncryption } from "aws-cdk-lib/aws-s3";
import { Repository, TagMutability } from "aws-cdk-lib/aws-ecr";
import { Distribution, ViewerProtocolPolicy, CachePolicy, PriceClass } from "aws-cdk-lib/aws-cloudfront";
import { S3BucketOrigin } from "aws-cdk-lib/aws-cloudfront-origins";
import { CfnRuntime } from "aws-cdk-lib/aws-bedrockagentcore";
import { Function, Runtime, Architecture, Code } from "aws-cdk-lib/aws-lambda";
import { Role } from "aws-cdk-lib/aws-iam";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
import { resolve } from "node:path";
import { ROOT } from "../agent/config.ts";

const app = new App({ outdir: process.env.CDK_OUTDIR || resolve(ROOT, ".local/aws-deployment-20261010/cdk.out") });
const stack = new Stack(app, "CourtsideCloud", {
  env: { account: "414702114718", region: "us-east-1" },
  terminationProtection: true,
  description: "NBA COURTSIDE ARM64 CPU AgentCore, IAM-only invocation, private S3 and CloudFront film delivery. Reuses preprovisioned workload role.",
});
Tags.of(stack).add("Project", "aws-nba"); Tags.of(stack).add("Purpose", "courtside-demo");
if (app.node.tryGetContext("imageUpload") === "true") {
  const transport = new Stack(app, "CourtsideImagePublisher", { env: { account: "414702114718", region: "us-east-1" }, description: "Private one-shot S3 to ECR image transport; preprovisioned role, no public endpoint or model calls." });
  Tags.of(transport).add("Project", "aws-nba");
  const role = Role.fromRoleArn(transport, "Workload", "arn:aws:iam::414702114718:role/NBAHackathonWorkloadRole", { mutable: false });
  const logGroup = new LogGroup(transport, "Logs", { retention: RetentionDays.ONE_WEEK, removalPolicy: RemovalPolicy.RETAIN });
  const publisher = new Function(transport, "Publisher", { functionName: "courtside-image-publisher", runtime: Runtime.PYTHON_3_12,
    architecture: Architecture.ARM_64, code: Code.fromAsset(resolve(ROOT, "infra/image-publisher")), handler: "index.handler", role,
    timeout: Duration.minutes(15), memorySize: 512, reservedConcurrentExecutions: 1, retryAttempts: 0, logGroup });
  new CfnOutput(transport, "FunctionName", { value: publisher.functionName });
}
const repo = new Repository(stack, "ImageRepository", { repositoryName: "courtside-agent", imageScanOnPush: true, imageTagMutability: TagMutability.IMMUTABLE, removalPolicy: RemovalPolicy.RETAIN });
const site = new Bucket(stack, "Site", {
  bucketName: "courtside-web-414702114718-v1", blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
  encryption: BucketEncryption.S3_MANAGED, enforceSSL: true, removalPolicy: RemovalPolicy.RETAIN,
});
const origin = S3BucketOrigin.withOriginAccessControl(site);
const distribution = new Distribution(stack, "Web", {
  defaultRootObject: "index.html", priceClass: PriceClass.PRICE_CLASS_100,
  defaultBehavior: { origin, viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS, compress: true },
  additionalBehaviors: { "/api/*": { origin, viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS, cachePolicy: CachePolicy.CACHING_DISABLED } },
  errorResponses: [{ httpStatus: 404, ttl: Duration.seconds(0) }, { httpStatus: 403, ttl: Duration.seconds(0) }],
});
if (app.node.tryGetContext("runtime") === "true") {
  const image = new CfnParameter(stack, "RuntimeImageUri", { type: "String", allowedPattern: "414702114718\\.dkr\\.ecr\\.us-east-1\\.amazonaws\\.com/courtside-agent@sha256:[a-f0-9]{64}" });
  const runtime = new CfnRuntime(stack, "Agent", {
    agentRuntimeName: "courtside_video_agent", description: "Generic player role filtering, NBA data overlays, Sonnet narration and Chinese Polly film pipeline.",
    roleArn: "arn:aws:iam::414702114718:role/NBAHackathonWorkloadRole",
    agentRuntimeArtifact: { containerConfiguration: { containerUri: image.valueAsString } },
    protocolConfiguration: "HTTP", networkConfiguration: { networkMode: "PUBLIC" },
    lifecycleConfiguration: { idleRuntimeSessionTimeout: 60, maxLifetime: 1800 },
    environmentVariables: {
      AGENT_PROVIDER: "bedrock", ALLOW_PAID_MODEL_CALLS: "true", AWS_AUTH_MODE: "execution_role",
      AWS_REGION: "us-east-1", AWS_PROFILE: "nba", BEDROCK_MODEL_ID: "global.anthropic.claude-sonnet-4-6",
      AGENT_HOST: "0.0.0.0", AGENT_PORT: "8080", AGENT_RUNTIME_CONTAINER: "true", AGENT_DATA_DIR: "/tmp/courtside",
      FFMPEG_PATH: "/usr/bin/ffmpeg", VISION_PYTHON: "/usr/local/bin/python", TTS_PROVIDER: "polly",
      FILM_FONT_PATH: "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
      CLOUD_INPUT_BUCKET: "nba-hackathon-414702114718-team11", CLOUD_SITE_BUCKET: site.bucketName,
    },
  });
  new CfnOutput(stack, "RuntimeArn", { value: runtime.attrAgentRuntimeArn });
  new CfnOutput(stack, "RuntimeId", { value: runtime.attrAgentRuntimeId });
}
new CfnOutput(stack, "ImageRepositoryUri", { value: repo.repositoryUri });
new CfnOutput(stack, "SiteBucket", { value: site.bucketName });
new CfnOutput(stack, "WebUrl", { value: `https://${distribution.distributionDomainName}` });
new CfnOutput(stack, "DistributionId", { value: distribution.distributionId });
app.synth();
