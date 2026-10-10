"""One-shot private S3 to ECR transport for a fixed, hash-verified ARM64 image."""
import hashlib
import json
import urllib.error
import urllib.request

import boto3
from botocore.config import Config

ACCOUNT = "414702114718"
BUCKET = "nba-hackathon-414702114718-team11"
REPOSITORY = "courtside-agent"
REGISTRY = f"{ACCOUNT}.dkr.ecr.us-east-1.amazonaws.com"
DIGEST = "68d22461be4d1805da57471c0eee390c91960232fc0bafe3e6434e824b2c51df"
PREFIX = f"courtside/build/{DIGEST}/blobs/"
SESSION = boto3.Session(region_name="us-east-1")
CONFIG = Config(region_name="us-east-1", retries={"total_max_attempts": 1}, connect_timeout=10, read_timeout=90)
S3 = SESSION.client("s3", config=CONFIG)
ECR = SESSION.client("ecr", config=CONFIG)
STS = SESSION.client("sts", config=CONFIG)


def blob(digest, limit):
    response = S3.get_object(Bucket=BUCKET, Key=PREFIX + digest)
    with response["Body"] as body:
        data = body.read(limit + 1)
    if len(data) > limit or hashlib.sha256(data).hexdigest() != digest:
        raise ValueError("Invalid image metadata blob")
    return data


def registry_request(url, method, token, data=None):
    if not url.startswith(f"https://{REGISTRY}/v2/{REPOSITORY}/"):
        raise ValueError("Unexpected registry host or repository")
    request = urllib.request.Request(url, data=data, method=method, headers={
        "Authorization": "Basic " + token, "Content-Type": "application/octet-stream",
    })
    return urllib.request.urlopen(request, timeout=60)


def handler(event, context):
    if event != {"imageDigest": DIGEST}:
        raise ValueError("Only the reviewed deployment image is accepted")
    identity = STS.get_caller_identity()
    if identity["Account"] != ACCOUNT or not identity["Arn"].startswith(
        f"arn:aws:sts::{ACCOUNT}:assumed-role/NBAHackathonWorkloadRole/"
    ):
        raise PermissionError("Unexpected execution identity")
    manifest_bytes = blob(DIGEST, 100000)
    manifest = json.loads(manifest_bytes)
    config_digest = manifest["config"]["digest"].removeprefix("sha256:")
    config_bytes = blob(config_digest, 100000)
    config = json.loads(config_bytes)
    if config["architecture"] != "arm64" or config["os"] != "linux":
        raise ValueError("Unexpected image architecture")
    layers = manifest["layers"]
    if len(layers) > 30 or sum(layer["size"] for layer in layers) > 2000000000:
        raise ValueError("Image exceeds reviewed transfer limits")
    existing = ECR.batch_check_layer_availability(repositoryName=REPOSITORY, layerDigests=[layer["digest"] for layer in layers])
    available = {layer["layerDigest"] for layer in existing["layers"] if layer["layerAvailability"] == "AVAILABLE"}
    transferred = 0
    for layer in layers:
        if layer["digest"] in available:
            continue
        if context.get_remaining_time_in_millis() < 60000:
            raise TimeoutError("Insufficient execution time; published layers are reusable")
        response = S3.get_object(Bucket=BUCKET, Key=PREFIX + layer["digest"].removeprefix("sha256:"))
        if response["ContentLength"] != layer["size"]:
            response["Body"].close()
            raise ValueError("Layer size mismatch")
        upload = ECR.initiate_layer_upload(repositoryName=REPOSITORY)
        offset, digest = 0, hashlib.sha256()
        with response["Body"] as body:
            while offset < layer["size"]:
                size = min(upload["partSize"], layer["size"] - offset)
                part = body.read(size)
                if len(part) != size:
                    raise ValueError("Truncated image layer")
                digest.update(part)
                result = ECR.upload_layer_part(repositoryName=REPOSITORY, uploadId=upload["uploadId"],
                    partFirstByte=offset, partLastByte=offset + size - 1, layerPartBlob=part)
                if result["lastByteReceived"] != offset + size - 1:
                    raise ValueError("ECR part confirmation mismatch")
                offset += size
        if "sha256:" + digest.hexdigest() != layer["digest"]:
            raise ValueError("Image layer digest mismatch")
        ECR.complete_layer_upload(repositoryName=REPOSITORY, uploadId=upload["uploadId"], layerDigests=[layer["digest"]])
        transferred += offset
        print(json.dumps({"event": "layer_published", "digest": layer["digest"], "bytes": offset}))
    auth = ECR.get_authorization_token(registryIds=[ACCOUNT])["authorizationData"][0]["authorizationToken"]
    config_url = f"https://{REGISTRY}/v2/{REPOSITORY}/blobs/{manifest['config']['digest']}"
    try:
        with registry_request(config_url, "HEAD", auth):
            pass
    except urllib.error.HTTPError as error:
        if error.code != 404:
            raise
        with registry_request(f"https://{REGISTRY}/v2/{REPOSITORY}/blobs/uploads/", "POST", auth, b"") as started:
            location = started.headers["Location"]
        if location.startswith("/"):
            location = f"https://{REGISTRY}" + location
        separator = "&" if "?" in location else "?"
        with registry_request(location + separator + "digest=" + manifest["config"]["digest"], "PUT", auth, config_bytes):
            pass
    try:
        ECR.put_image(repositoryName=REPOSITORY, imageTag="cloud-v1", imageManifest=manifest_bytes.decode(),
            imageManifestMediaType=manifest["mediaType"], imageDigest="sha256:" + DIGEST)
    except ECR.exceptions.ImageAlreadyExistsException:
        pass
    image = ECR.describe_images(repositoryName=REPOSITORY, imageIds=[{"imageTag": "cloud-v1"}])["imageDetails"][0]
    if image["imageDigest"] != "sha256:" + DIGEST:
        raise ValueError("Published tag does not identify the reviewed image")
    return {"imageDigest": image["imageDigest"], "imageSizeInBytes": image["imageSizeInBytes"], "transferredBytes": transferred}
