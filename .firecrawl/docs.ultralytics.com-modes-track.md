[Ultralytics YOLO27:Coming soon. Join the waitlist.](https://www.ultralytics.com/yolo/yolo27)

 [Skip to main content](https://docs.ultralytics.com/modes/track#main-content)

- [Ultralytics](https://docs.ultralytics.com/)

Search...Ctrl K

- [Home](https://docs.ultralytics.com/)
- [Quickstart](https://docs.ultralytics.com/quickstart)

- Home
- Modes


  - [Overview](https://docs.ultralytics.com/modes)
  - [Train](https://docs.ultralytics.com/modes/train)
  - [Val](https://docs.ultralytics.com/modes/val)
  - [Predict](https://docs.ultralytics.com/modes/predict)
  - [Export](https://docs.ultralytics.com/modes/export)
  - [Track](https://docs.ultralytics.com/modes/track)
  - [Benchmark](https://docs.ultralytics.com/modes/benchmark)

- Tasks
- Models
- Compare
- Datasets
- Solutions
- Guides
- Integrations
- Platform
- [Rust Inference](https://docs.ultralytics.com/inference)
- Reference
- Help

### Get Started

Annotate, train and deploy YOLO models in one click.

- Cloud training
- Dataset annotation
- One-click inference

[$25 free creditswith work email](https://platform.ultralytics.com/signup)

[Get Started](https://platform.ultralytics.com/signup) [Sign in](https://docs.ultralytics.com/signin?redirect_url=%2Fmodes%2Ftrack)

Toggle Sidebar

1. [Docs](https://docs.ultralytics.com/)
3. [Modes](https://docs.ultralytics.com/modes)
5. Track

![](https://cdn.ul.run/i/flags/us.svg)Select language [GitHub repositoryGitHub138.1k](https://github.com/ultralytics/ultralytics) Switch apps [Get Started](https://platform.ultralytics.com/signup)

[Edit page on GitHub](https://github.com/ultralytics/ultralytics/blob/main/docs/en/modes/track.md)

# Multi-Object Tracking with Ultralytics YOLO [\#](https://docs.ultralytics.com/modes/track\#multi-object-tracking-with-ultralytics-yolo)

![YOLO multi-object tracking with trajectory paths](https://cdn.ul.run/i/6e908e05328f03661dc48ce86a4db3fc.avif)

Object tracking in the realm of video analytics is a critical task that not only identifies the location and class of objects within the frame but also maintains a unique ID for each detected object as the video progresses. The applications are limitless—ranging from surveillance and security to real-time sports analytics.

See the [unreleased YOLO27 preview](https://docs.ultralytics.com/models/yolo27#supported-tasks-and-modes) for planned tracking support.

🚀 New Trackers: OC-SORT, Deep OC-SORT, FastTracker, TrackTrack

Starting with `ultralytics` 8.4.63, [OC-SORT](https://docs.ultralytics.com/modes/track#oc-sort), [Deep OC-SORT](https://docs.ultralytics.com/modes/track#deep-oc-sort), [FastTracker](https://docs.ultralytics.com/modes/track#fasttracker), and [TrackTrack](https://docs.ultralytics.com/modes/track#tracktrack) are available alongside BoT-SORT and ByteTrack.

## Why Choose Ultralytics YOLO for Object Tracking? [\#](https://docs.ultralytics.com/modes/track\#why-choose-ultralytics-yolo-for-object-tracking)

The output from Ultralytics trackers is consistent with standard [object detection](https://www.ultralytics.com/glossary/object-detection) but has the added value of object IDs. This makes it easy to track objects in video streams and perform subsequent analytics. Here's why you should consider using Ultralytics YOLO for your object tracking needs:

- **Efficiency:** Process video streams in real-time without compromising [accuracy](https://www.ultralytics.com/glossary/accuracy).
- **Flexibility:** Supports multiple tracking algorithms and configurations.
- **Ease of Use:** Simple Python API and CLI options for quick integration and deployment.
- **Customizability:** Easy to use with custom-trained YOLO models, allowing integration into domain-specific applications.

**Watch:** How to Run Multi-Object Tracking with Ultralytics YOLO26 \| BoT-SORT & ByteTrack \| VisionAI 🚀

## Real-world Applications [\#](https://docs.ultralytics.com/modes/track\#real-world-applications)

| Transportation | Retail | Aquaculture |
| --- | --- | --- |
|  |  |  |
| Vehicle Tracking | People Tracking | Fish Tracking |

## Quick Start [\#](https://docs.ultralytics.com/modes/track\#quick-start)

Run tracking on a video with the default TrackTrack tracker. Swap to another tracker by changing the `tracker` argument.

Example

PythonCLI

```
from ultralytics import YOLO

model = YOLO("yolo26n.pt")

# Default tracker (TrackTrack)
results = model.track(source="https://youtu.be/LNwODJXcvt4", show=True)

# Switch to ByteTrack
results = model.track(source="https://youtu.be/LNwODJXcvt4", show=True, tracker="bytetrack.yaml")
```

To run the tracker on video streams, use a trained Detect, Segment, Pose, or OBB model such as YOLO26n, YOLO26n-seg, YOLO26n-pose, or YOLO26n-obb. You can train custom models locally or with [Ultralytics Platform cloud training](https://docs.ultralytics.com/platform/train/cloud-training).

Example

PythonCLI

```
from ultralytics import YOLO

# Load an official or custom model
model = YOLO("yolo26n.pt")  # Load an official Detect model
model = YOLO("yolo26n-seg.pt")  # Load an official Segment model
model = YOLO("yolo26n-pose.pt")  # Load an official Pose model
model = YOLO("path/to/best.pt")  # Load a custom-trained model

# Perform tracking with the model
results = model.track("https://youtu.be/LNwODJXcvt4", show=True)  # Tracking with default tracker
results = model.track("https://youtu.be/LNwODJXcvt4", show=True, tracker="bytetrack.yaml")  # with ByteTrack
```

## Supported Trackers [\#](https://docs.ultralytics.com/modes/track\#supported-trackers)

Ultralytics YOLO ships with six built-in trackers. Enable one by passing its YAML config file to the `tracker` argument.

| Tracker | Config file | Motion model | Appearance / ReID | Camera motion compensation | Occlusion handling |
| --- | --- | --- | --- | --- | --- |
| **[BoT-SORT](https://docs.ultralytics.com/modes/track#bot-sort)** | `botsort.yaml` | Linear Kalman | Optional (`with_reid`) | Configurable (`gmc_method`) | Track buffer + ReID rebinding |
| **[ByteTrack](https://docs.ultralytics.com/modes/track#bytetrack)** | `bytetrack.yaml` | Linear Kalman | None | No | Two-stage low-conf rescue |
| **[OC-SORT](https://docs.ultralytics.com/modes/track#oc-sort)** | `ocsort.yaml` | Observation-centric Kalman | None | No | ORU, OCM, OCR re-update from last observation |
| **[Deep OC-SORT](https://docs.ultralytics.com/modes/track#deep-oc-sort)** | `deepocsort.yaml` | Observation-centric Kalman | Optional (`with_reid`) | Configurable (`gmc_method`) | OC-SORT + optional adaptive appearance EMA |
| **[FastTracker](https://docs.ultralytics.com/modes/track#fasttracker)** | `fasttrack.yaml` | Linear Kalman + rollback | None | No | Kalman rollback + bbox enlargement on occlusion |
| **[TrackTrack](https://docs.ultralytics.com/modes/track#tracktrack)** | `tracktrack.yaml` | Linear Kalman (NSA) | Optional (`with_reid`) | Configurable (`gmc_method`) | Iterative multi-cue association + TAI |

### Which Tracker Should I Use? [\#](https://docs.ultralytics.com/modes/track\#which-tracker-should-i-use)

Use this flow to pick a starting point; `tracktrack.yaml` is used when you pass no `tracker`:

1. **Need the fastest, simplest baseline?** → **ByteTrack** (no ReID, no camera-motion compensation, minimum overhead).
2. **Handheld, drone, or moving-camera footage?** → **BoT-SORT** (adds camera-motion compensation and optional ReID).
3. **Non-linear motion (sports, dancing, abrupt turns) and no ReID?** → **OC-SORT** (observation-centric corrections without appearance cost).
4. **Crowded moving-camera scenes where ID swaps are the main problem?** → **Deep OC-SORT** or **TrackTrack** (both support optional appearance matching; TrackTrack also adds multi-cue association and duplicate-ID suppression).
5. **Frequent partial overlap in real-time, no ReID budget?** → **FastTracker** (occlusion-aware ByteTrack variant with Kalman rollback).

## Switching Trackers [\#](https://docs.ultralytics.com/modes/track\#switching-trackers)

Pass the tracker config filename to `tracker=`. All other code stays the same.

Example

PythonCLI

```
from ultralytics import YOLO

model = YOLO("yolo26n.pt")

results = model.track(source="path/to/video.mp4", tracker="bytetrack.yaml")
results = model.track(source="path/to/video.mp4", tracker="ocsort.yaml")
results = model.track(source="path/to/video.mp4", tracker="tracktrack.yaml")
```

## Configuration [\#](https://docs.ultralytics.com/modes/track\#configuration)

### Tracking Arguments [\#](https://docs.ultralytics.com/modes/track\#tracking-arguments)

Tracking configuration shares properties with Predict mode, such as `conf`, `iou`, and `show`. For further configurations, refer to the [Predict](https://docs.ultralytics.com/modes/predict#inference-arguments) model page.

Example

PythonCLI

```
from ultralytics import YOLO

# Configure the tracking parameters and run the tracker
model = YOLO("yolo26n.pt")
results = model.track(source="https://youtu.be/LNwODJXcvt4", conf=0.1, iou=0.7, show=True)
```

### Custom Tracker Configuration [\#](https://docs.ultralytics.com/modes/track\#custom-tracker-configuration)

Ultralytics also allows you to use a modified tracker configuration file. To do this, simply make a copy of a tracker config file (for example, `custom_tracker.yaml`) from [ultralytics/cfg/trackers](https://github.com/ultralytics/ultralytics/tree/main/ultralytics/cfg/trackers) and modify any configurations (except the `tracker_type`) as per your needs.

Example

PythonCLI

```
from ultralytics import YOLO

# Load the model and run the tracker with a custom configuration file
model = YOLO("yolo26n.pt")
results = model.track(source="https://youtu.be/LNwODJXcvt4", tracker="custom_tracker.yaml")
```

### Shared Tracker Arguments [\#](https://docs.ultralytics.com/modes/track\#shared-tracker-arguments)

The following parameters are common to most tracker YAML files; not every parameter appears in every config:

Tracker Threshold Information

Detections at or above `track_high_thresh` enter the first association stage. Detections between `track_low_thresh` and `track_high_thresh` can recover existing tracks when the selected tracker enables low-confidence association, but they do not start new tracks. Detections at or below `track_low_thresh` are ignored.

| Parameter | Valid Values or Ranges | Description |
| --- | --- | --- |
| `tracker_type` | `botsort`, `bytetrack`, `ocsort`, `deepocsort`, `fasttrack`, `tracktrack` | Specifies the tracker type. |
| `track_high_thresh` | `0.0-1.0` | Threshold for the first association. Affects how confidently a detection is matched to an existing track. |
| `track_low_thresh` | `0.0-1.0` | Lower bound for low-confidence recovery detections. OC-SORT and Deep OC-SORT use these only when `use_byte: True`; TrackTrack includes them in its penalized association pool. |
| `new_track_thresh` | `0.0-1.0` | Threshold to initialize a new track if the detection does not match any existing tracks. |
| `track_buffer` | `>=0` | Frames lost tracks are kept alive before removal. Higher value means more tolerance for occlusion. |
| `match_thresh` | `0.0-1.0` | Threshold for matching tracks. Higher values make matching more lenient. |
| `fuse_score` | `True`, `False` | Whether to fuse confidence scores with IoU distances before matching. |
| `gmc_method` | `sparseOptFlow`, `orb`, `sift`, `ecc`, `none` | Global motion compensation method. Helps account for camera movement. |
| `proximity_thresh` | `0.0-1.0` | Minimum IoU required for a valid ReID match. Ensures spatial closeness before using appearance cues. |
| `appearance_thresh` | `0.0-1.0` | Minimum normalized appearance similarity required for ReID. |
| `with_reid` | `True`, `False` | Enable appearance-based matching for better tracking across occlusions. Supported by BoT-SORT, Deep OC-SORT, and TrackTrack. |
| `model` | `auto` or compatible ReID model path | ReID model. `auto` uses native YOLO backbone features when available; otherwise falls back to `yolo26n-cls.pt`. A custom encoder can be a `.pt` checkpoint or an exported model such as `.torchscript`, `.onnx`, `.engine`, or an OpenVINO model directory. |

#### Tracker-specific Arguments [\#](https://docs.ultralytics.com/modes/track\#tracker-specific-arguments)

Each algorithm exposes additional knobs on top of the shared parameters. See the per-tracker sections below for descriptions and tuning advice, or refer directly to the config files:

- [`botsort.yaml`](https://github.com/ultralytics/ultralytics/blob/main/ultralytics/cfg/trackers/botsort.yaml)
- [`bytetrack.yaml`](https://github.com/ultralytics/ultralytics/blob/main/ultralytics/cfg/trackers/bytetrack.yaml)
- [`ocsort.yaml`](https://github.com/ultralytics/ultralytics/blob/main/ultralytics/cfg/trackers/ocsort.yaml)
- [`deepocsort.yaml`](https://github.com/ultralytics/ultralytics/blob/main/ultralytics/cfg/trackers/deepocsort.yaml)
- [`fasttrack.yaml`](https://github.com/ultralytics/ultralytics/blob/main/ultralytics/cfg/trackers/fasttrack.yaml)
- [`tracktrack.yaml`](https://github.com/ultralytics/ultralytics/blob/main/ultralytics/cfg/trackers/tracktrack.yaml)

### Enabling Re-Identification (ReID) [\#](https://docs.ultralytics.com/modes/track\#enabling-re-identification-reid)

ReID is disabled by default to minimize overhead. Enable it by setting `with_reid: True` in a tracker config file.

**ReID model options:**

- **`model: auto`** — Uses native YOLO detector features, adding minimal overhead. Ideal when you need some ReID without a large performance hit. Falls back to `yolo26n-cls.pt` if the detector does not expose compatible features.
- **Custom ReID model** — Point `model:` at a `.pt` checkpoint or a compatible exported embedding model, such as `.torchscript`, `.onnx`, `.engine`, or an OpenVINO model directory. Exported models are loaded through `AutoBackend` and must output an embedding tensor directly.

Ready-to-use ONNX encoders are published for every model size. Set `model:` to one of these names and the file is downloaded automatically the first time the tracker runs (the same way YOLO weights are fetched) — no manual export or download step required:

```
# In your tracker config (e.g. tracktrack.yaml)
with_reid: True
model: yolo26n-reid.onnx # downloaded on first use; swap n→s/m/l/x for a larger encoder
```

| Model | size<br>(pixels) | params<br>(M) | FLOPs<br>(B) |
| --- | --- | --- | --- |
| [YOLO26n-reid.onnx](https://github.com/ultralytics/assets/releases/download/v8.4.0/yolo26n-reid.onnx) | 448 | 2.8 | 2.0 |
| [YOLO26s-reid.onnx](https://github.com/ultralytics/assets/releases/download/v8.4.0/yolo26s-reid.onnx) | 448 | 7.5 | 6.6 |
| [YOLO26m-reid.onnx](https://github.com/ultralytics/assets/releases/download/v8.4.0/yolo26m-reid.onnx) | 448 | 12.4 | 20.1 |
| [YOLO26l-reid.onnx](https://github.com/ultralytics/assets/releases/download/v8.4.0/yolo26l-reid.onnx) | 448 | 15.3 | 25.2 |
| [YOLO26x-reid.onnx](https://github.com/ultralytics/assets/releases/download/v8.4.0/yolo26x-reid.onnx) | 448 | 32.7 | 55.9 |

ReID is tracking-only

Only ONNX ReID encoders for the tracker appearance branch are currently available. ReID `train`, `val`, and `predict` modes, as well as dedicated ReID export recipes, are still under development.

For better performance with a separate classification model, export it to a faster backend like TensorRT:

Exporting a ReID model to TensorRT

```
from torch import nn

from ultralytics import YOLO

# Load the classification model
model = YOLO("yolo26n-cls.pt")

# Add average pooling layer
head = model.model.model[-1]
pool = nn.Sequential(nn.AdaptiveAvgPool2d((1, 1)), nn.Flatten(start_dim=1))
pool.f, pool.i = head.f, head.i
model.model.model[-1] = pool

# Export to TensorRT
model.export(format="engine", quantize=16, dynamic=True, batch=32)
```

Once exported, point to the TensorRT model path in your tracker config.

## Tracker Details [\#](https://docs.ultralytics.com/modes/track\#tracker-details)

The sections below describe each tracker's design, specific parameters, and tuning tips.

**Watch:** Which Object Tracker Performs Better? \| Speed, FPS & ID Stability \| Ultralytics YOLO26 📊

### BoT-SORT [\#](https://docs.ultralytics.com/modes/track\#bot-sort)

[BoT-SORT](https://github.com/NirAharon/BoT-SORT) (Aharon et al., 2022) extends ByteTrack with camera-motion compensation and optional ReID:

- **Camera Motion Compensation (CMC):** an affine warp estimated each frame (sparse optical flow by default; ORB / ECC also available) is applied to Kalman states before IoU matching.
- **Optional ReID:** appearance embeddings can be fused into the cost matrix. Disabled by default; enable with `with_reid: True`.

**Best for:** general-purpose tracking, especially moving cameras. Add ReID only when look-alike crowds cause ID swaps.

**BoT-SORT-specific arguments:**

| Parameter | Valid Values or Ranges | Description |
| --- | --- | --- |
| `gmc_method` | `sparseOptFlow`, `orb`, `sift`, `ecc`, `none` | Camera-motion-compensation backend. `sparseOptFlow` is the default. `none` disables CMC. |
| `with_reid` | `True`, `False` | Enable appearance-based matching. Off by default. |
| `model` | `auto` or compatible ReID model path | `auto` uses native YOLO features when available; custom models can be `.pt` checkpoints or compatible exports. |
| `proximity_thresh` | `0.0-1.0` | Minimum IoU before appearance features are considered. |
| `appearance_thresh` | `0.0-1.0` | Minimum normalized appearance similarity required for a ReID match. Raise to make matching stricter. |

**Tuning tips:**

- **Static camera:** set `gmc_method: none` to save a few ms/frame.
- **Heavy camera motion:** keep `sparseOptFlow`; `ecc` is more accurate but slower.
- **Look-alike crowds:** turn on `with_reid: True` and raise `appearance_thresh` (e.g. `0.85+`).

### ByteTrack [\#](https://docs.ultralytics.com/modes/track\#bytetrack)

[ByteTrack](https://github.com/FoundationVision/ByteTrack) (Zhang et al., ECCV 2022) is the lightweight baseline. It uses linear Kalman + IoU with a two-stage association:

- **Stage 1:** match high-score detections against active tracks.
- **Stage 2:** retry unmatched tracks against low-score detections to recover through brief partial occlusion.

There is no appearance model and no camera-motion compensation.

**Best for:** static or near-static cameras where detector cost dominates and you want minimum tracker overhead.

**ByteTrack-specific arguments:** None beyond the [shared tracker arguments](https://docs.ultralytics.com/modes/track#shared-tracker-arguments).

**Tuning tips:**

- **Noisy detector:** lower `track_low_thresh` so the second stage has more candidates.
- **High-recall detector:** raise `track_high_thresh` to reduce fragmented IDs.
- **Frequent ID flicker:** raise `track_buffer` so briefly-missed tracks survive.

### OC-SORT [\#](https://docs.ultralytics.com/modes/track\#oc-sort)

[OC-SORT](https://arxiv.org/abs/2203.14360) (Cao et al., CVPR 2023) is an observation-centric extension of SORT. It keeps SORT's lightweight design (no appearance features) and adds three corrections:

- **Observation-Centric Re-update (ORU):** replays a virtual trajectory between the last observation and the current detection, re-running the Kalman update to repair drifted velocity.
- **Observation-Centric Momentum (OCM):** penalizes detections moving in the wrong direction via a velocity-consistency term.
- **Observation-Centric Recovery (OCR):** re-checks unmatched detections against recently lost tracks using their last observation rather than the predicted state.

**Best for:** non-linear motion without the cost of a ReID model.

**OC-SORT-specific arguments:**

| Parameter | Valid Values or Ranges | Description |
| --- | --- | --- |
| `delta_t` | `>=1` | Temporal window (frames) for velocity-direction computation in OCM. Larger values smooth more. |
| `inertia` | `0.0-1.0` | Weight of the velocity-consistency cost. Higher values penalize sudden direction changes. |
| `use_byte` | `True`, `False` | Enable a ByteTrack-style second association pass over low-confidence detections. |

**Tuning tips:**

- **Non-linear motion:** raise `inertia` (e.g. `0.3-0.4`).
- **Sparse detections:** enable `use_byte: True`.
- **Long occlusions:** raise `track_buffer` so OCR has more lost tracks to rebind.

With OBB models, OCR uses the Kalman-predicted oriented box because an oriented last-observation history is not retained.

### Deep OC-SORT [\#](https://docs.ultralytics.com/modes/track\#deep-oc-sort)

[Deep OC-SORT](https://arxiv.org/abs/2302.11813) augments OC-SORT with appearance information and camera-motion compensation:

- **Appearance matching:** cosine embedding distance is gated by overlap and fused with motion cost.
- **Dynamic appearance EMA:** track embeddings update with an EMA whose smoothing factor adapts to detection confidence.
- **Camera Motion Compensation:** Kalman states are warped frame-to-frame via sparse optical flow, ORB, or ECC.

**Best for:** crowded or moving-camera scenes where ID swaps between visually different but spatially close objects are common.

**Deep OC-SORT-specific arguments:**

| Parameter | Valid Values or Ranges | Description |
| --- | --- | --- |
| `with_reid` | `True`, `False` | Enable appearance-based matching. Off by default. |
| `model` | `auto` or compatible ReID model path | `auto` uses native YOLO features when available; custom models can be `.pt` checkpoints or compatible exports. |
| `proximity_thresh` | `0.0-1.0` | Minimum IoU before appearance features are considered. |
| `appearance_thresh` | `0.0-1.0` | Minimum normalized appearance similarity required for a ReID match. |
| `alpha_fixed_emb` | `0.0-1.0` | Base EMA factor for track-embedding updates. Higher values preserve the older embedding longer. |
| `gmc_method` | `sparseOptFlow`, `orb`, `sift`, `ecc`, `none` | Global motion compensation method. |
| `delta_t` | `>=1` | Temporal window (frames) for velocity-direction computation in OCM (inherited from OC-SORT). |
| `inertia` | `0.0-1.0` | Weight of the velocity-consistency cost (inherited from OC-SORT). |
| `use_byte` | `True`, `False` | Enable a ByteTrack-style second association over low-confidence detections (inherited from OC-SORT). |

**Tuning tips:**

- **Identity swaps in crowds:** raise `appearance_thresh` (e.g. `0.92-0.95`) and raise `alpha_fixed_emb` so embeddings adapt more slowly.
- **Moving camera:** set `gmc_method: sparseOptFlow` (Deep OC-SORT defaults to `none`).
- **Lower latency:** keep `with_reid: False` (default) for motion + CMC only; enable ReID only when ID swaps dominate errors.

### FastTracker [\#](https://docs.ultralytics.com/modes/track\#fasttracker)

[FastTracker](https://arxiv.org/abs/2508.14370) is an occlusion-aware ByteTrack variant with no appearance model:

- **Occlusion detection:** flags tracks occluded when coverage by other active tracks exceeds `occ_cover_thresh`.
- **Kalman rollback on occlusion:** rolls the Kalman state back to a pre-occlusion frame using ring-buffered history.
- **Motion dampening and search expansion:** velocity is dampened and the predicted bbox is enlarged while occluded.
- **Init-IoU suppression:** prevents new tracks from spawning on top of active tracks.

**Best for:** real-time detection-only pipelines with frequent target-on-target overlap (crowds, queues, sports).

**FastTracker-specific arguments:**

| Parameter | Valid Values or Ranges | Description |
| --- | --- | --- |
| `reset_velocity_offset_occ` | `>=0` | History frames back to restore Kalman velocity on occlusion onset. |
| `reset_pos_offset_occ` | `>=0` | History frames back to restore Kalman position on occlusion onset. |
| `enlarge_bbox_occ` | `>=1.0` | Height scaling applied to the predicted bbox while occluded (width scales via XYAH aspect ratio). |
| `dampen_motion_occ` | `0.0-1.0` | Velocity multiplier while occluded. Lower values make the track "slow down" through occlusion. |
| `active_occ_to_lost_thresh` | `>=1` | Max consecutive occluded frames before an active track is moved to lost. |
| `occ_cover_thresh` | `0.0-1.0` | Fraction of a track's area covered by another active track to declare occlusion. |
| `occ_reappear_window` | `>=0` | Frames a recently-occluded lost track stays preferentially re-findable. |
| `init_iou_suppress` | `0.0-1.0` | Suppress new-track initialization if its IoU with any active track exceeds this. Set to `1.0` to disable. |

**Tuning tips:**

- **Frequent partial occlusions:** lower `occ_cover_thresh` (e.g. `0.5-0.6`).
- **Duplicate IDs around overlap:** lower `init_iou_suppress` (e.g. `0.5`).
- **Long occlusions:** raise `occ_reappear_window` and `track_buffer` together.
- **Fast-moving targets:** raise `dampen_motion_occ` (closer to `1.0`); raise `enlarge_bbox_occ` only when a wider search region improves recovery.

### TrackTrack [\#](https://docs.ultralytics.com/modes/track\#tracktrack)

[TrackTrack](https://openaccess.thecvf.com/content/CVPR2025/papers/Shim_Focusing_on_Tracks_for_Online_Multi-Object_Tracking_CVPR_2025_paper.pdf) (Shim et al., CVPR 2025) is the default tracker. It reasons from each track's perspective with multi-cue iterative association:

- **Track-Perspective-Based Association (TPA):** combines HMIoU, optional cosine ReID distance, confidence-projection distance, and corner-angle distance. Assignment is solved iteratively with a relaxing threshold.
- **Track-Aware Initialization (TAI):** suppresses duplicate spawns before a new ID is created.

**Best for:** crowded scenes with frequent occlusion where duplicate IDs are a problem.

**TrackTrack-specific arguments:**

| Parameter | Valid Values or Ranges | Description |
| --- | --- | --- |
| `iou_weight` | `0.0-1.0` | Weight of HMIoU distance when ReID is enabled; otherwise HMIoU is used directly. |
| `reid_weight` | `0.0-1.0` | Weight of cosine ReID distance when ReID is enabled; otherwise it is ignored. |
| `conf_weight` | `0.0-1.0` | Weight of confidence-projection distance. |
| `angle_weight` | `0.0-1.0` | Weight of corner-angle distance. |
| `penalty_p` | `0.0-1.0` | Cost penalty for low-confidence detections. |
| `penalty_q` | `0.0-1.0` | Cost penalty for detections recovered by secondary NMS. |
| `reduce_step` | `0.0-1.0` | Match-threshold relaxation per iteration. |
| `tai_thr` | `0.0-1.0` | IoU threshold for Track-Aware Initialization NMS. |
| `min_track_len` | `>=0` | Minimum history length before a new track is confirmed. |
| `lost_match_thr` | `0.0-1.0` | Looser cost gate for relaxed lost-rebind pass; `0` disables it. |
| `with_reid` | `True`, `False` | Enable cosine-ReID appearance matching (uses native YOLO features). Off by default. |
| `model` | `auto` or compatible ReID model path | `auto` uses native YOLO features when available; custom models can be `.pt` checkpoints or compatible exports. |
| `gmc_method` | `sparseOptFlow`, `orb`, `sift`, `ecc`, `none` | Global motion compensation method. |

**Tuning tips:**

- **Crowded pedestrians:** lower `tai_thr` (e.g. `0.45`) to suppress more duplicate spawns; raise `track_buffer` for longer occlusions.
- **Fast camera motion:** keep `gmc_method: sparseOptFlow` enabled.
- **Small/fast objects:** raise `angle_weight` slightly and lower `min_track_len`.
- **Enable ReID only when needed:** it adds inference cost; for short occlusions, the default multi-cue cost is usually sufficient.

With Segment and Pose models, TrackTrack skips loose-NMS detection recovery so masks and keypoints remain aligned with their detections.

## Python Examples [\#](https://docs.ultralytics.com/modes/track\#python-examples)

**Watch:** How to Build Interactive Object Tracking with Ultralytics YOLO \| Click to Crop & Display ⚡

### Persisting Tracks Loop [\#](https://docs.ultralytics.com/modes/track\#persisting-tracks-loop)

Here is a Python script using [OpenCV](https://www.ultralytics.com/glossary/opencv) (`cv2`) and YOLO26 to run object tracking on video frames. This script assumes the necessary packages (`opencv-python` and `ultralytics`) are already installed. The `persist=True` argument tells the tracker that the current image or frame is the next in a sequence and to expect tracks from the previous image in the current image.

Persisting tracks and selecting a tracker

Use `persist=True` only when passing consecutive frames from the same video stream to `model.track()`. This lets the tracker reuse state from earlier frames and maintain consistent track IDs over time. Do not use `persist=True` across unrelated images or a different stream, since previous track state can carry over.

You can also choose a tracker backend by passing a tracker configuration file, such as `tracker="botsort.yaml"`, `tracker="bytetrack.yaml"`, or `tracker="tracktrack.yaml"`.

Streaming for-loop with tracking

```
import cv2

from ultralytics import YOLO

# Load the YOLO26 model
model = YOLO("yolo26n.pt")

# Open the video file
video_path = "path/to/video.mp4"
cap = cv2.VideoCapture(video_path)

# Loop through the video frames
while cap.isOpened():
    # Read a frame from the video
    success, frame = cap.read()

    if success:
        # Run YOLO26 tracking on the frame, persisting tracks between frames
        # and using the BoT-SORT tracker backend
        results = model.track(frame, persist=True, tracker="botsort.yaml")

        # Visualize the results on the frame
        annotated_frame = results[0].plot()

        # Display the annotated frame
        cv2.imshow("YOLO26 Tracking", annotated_frame)

        # Break the loop if 'q' is pressed
        if cv2.waitKey(1) & 0xFF == ord("q"):
            break
    else:
        # Break the loop if the end of the video is reached
        break

# Release the video capture object and close the display window
cap.release()
cv2.destroyAllWindows()
```

Please note the change from `model(frame)` to `model.track(frame)`, which enables object tracking instead of simple detection. This modified script will run the tracker on each frame of the video, visualize the results, and display them in a window. The loop can be exited by pressing 'q'.

### Plotting Tracks Over Time [\#](https://docs.ultralytics.com/modes/track\#plotting-tracks-over-time)

Visualizing object tracks over consecutive frames can provide valuable insights into the movement patterns and behavior of detected objects within a video. With Ultralytics YOLO26, plotting these tracks is a seamless and efficient process.

In the following example, we demonstrate how to utilize YOLO26's tracking capabilities to plot the movement of detected objects across multiple video frames. This script involves opening a video file, reading it frame by frame, and utilizing the YOLO model to identify and track various objects. By retaining the center points of the detected bounding boxes and connecting them, we can draw lines that represent the paths followed by the tracked objects.

Plotting tracks over multiple video frames

```
from collections import defaultdict

import cv2
import numpy as np

from ultralytics import YOLO

# Load the YOLO26 model
model = YOLO("yolo26n.pt")

# Open the video file
video_path = "path/to/video.mp4"
cap = cv2.VideoCapture(video_path)

# Store the track history
track_history = defaultdict(list)

# Loop through the video frames
while cap.isOpened():
    # Read a frame from the video
    success, frame = cap.read()

    if success:
        # Run YOLO26 tracking on the frame, persisting tracks between frames
        result = model.track(frame, persist=True)[0]

        # Get the boxes and track IDs
        if result.boxes and result.boxes.is_track:
            boxes = result.boxes.xywh.cpu()
            track_ids = result.boxes.id.int().cpu().tolist()

            # Visualize the result on the frame
            frame = result.plot()

            # Plot the tracks
            for box, track_id in zip(boxes, track_ids):
                x, y, w, h = box
                track = track_history[track_id]
                track.append((float(x), float(y)))  # x, y center point
                if len(track) > 30:  # retain 30 tracks for 30 frames
                    track.pop(0)

                # Draw the tracking lines
                points = np.hstack(track).astype(np.int32).reshape((-1, 1, 2))
                cv2.polylines(frame, [points], isClosed=False, color=(230, 230, 230), thickness=10)

        # Display the annotated frame
        cv2.imshow("YOLO26 Tracking", frame)

        # Break the loop if 'q' is pressed
        if cv2.waitKey(1) & 0xFF == ord("q"):
            break
    else:
        # Break the loop if the end of the video is reached
        break

# Release the video capture object and close the display window
cap.release()
cv2.destroyAllWindows()
```

### Multithreaded Tracking [\#](https://docs.ultralytics.com/modes/track\#multithreaded-tracking)

Multithreaded tracking provides the capability to run object tracking on multiple video streams simultaneously. This is particularly useful when handling multiple video inputs, such as from multiple surveillance cameras, where concurrent processing can greatly enhance efficiency and performance.

In the provided Python script, we make use of Python's `threading` module to run multiple instances of the tracker concurrently. Each thread is responsible for running the tracker on one video file, and all the threads run simultaneously in the background.

To ensure that each thread receives the correct parameters (the video file, the model to use and the file index), we define a function `run_tracker_in_thread` that accepts these parameters and contains the main tracking loop. This function reads the video frame by frame, runs the tracker, and saves the annotated results.

Two different models are used in this example: `yolo26n.pt` and `yolo26n-seg.pt`, each tracking objects in a different video file. The video files are specified in `SOURCES`.

The `daemon=True` parameter in `threading.Thread` means that these threads will be closed as soon as the main program finishes. We then start the threads with `start()` and use `join()` to make the main thread wait until both tracker threads have finished.

Finally, after all threads have completed their task, the windows displaying the results are closed using `cv2.destroyAllWindows()`.

Multithreaded tracking implementation

```
import threading

import cv2

from ultralytics import YOLO

# Define model names and video sources
MODEL_NAMES = ["yolo26n.pt", "yolo26n-seg.pt"]
SOURCES = ["path/to/video.mp4", "0"]  # local video, 0 for webcam

def run_tracker_in_thread(model_name, filename):
    """Run YOLO tracker in its own thread for concurrent processing.

    Args:
        model_name (str): Model checkpoint name or path loaded inside the thread.
        filename (str): The path to the video file or the identifier for the webcam/external camera source.
    """
    model = YOLO(model_name)
    results = model.track(filename, save=True, stream=True)
    for r in results:
        pass

# Create and start tracker threads using a for loop
tracker_threads = []
for video_file, model_name in zip(SOURCES, MODEL_NAMES):
    thread = threading.Thread(target=run_tracker_in_thread, args=(model_name, video_file), daemon=True)
    tracker_threads.append(thread)
    thread.start()

# Wait for all tracker threads to finish
for thread in tracker_threads:
    thread.join()

# Clean up and close windows
cv2.destroyAllWindows()
```

This example can easily be extended to handle more video files and models by creating more threads and applying the same methodology.

## Contribute New Trackers [\#](https://docs.ultralytics.com/modes/track\#contribute-new-trackers)

Are you proficient in multi-object tracking and have successfully implemented or adapted a tracking algorithm with Ultralytics YOLO? We invite you to contribute to our Trackers section in [ultralytics/cfg/trackers](https://github.com/ultralytics/ultralytics/tree/main/ultralytics/cfg/trackers)! Your real-world applications and solutions could be invaluable for users working on tracking tasks.

By contributing to this section, you help expand the scope of tracking solutions available within the Ultralytics YOLO framework, adding another layer of functionality and utility for the community.

To initiate your contribution, please refer to our [Contributing Guide](https://docs.ultralytics.com/help/contributing) for comprehensive instructions on submitting a Pull Request (PR) 🛠️. We are excited to see what you bring to the table!

Together, let's enhance the tracking capabilities of the Ultralytics YOLO ecosystem 🙏!

## FAQ [\#](https://docs.ultralytics.com/modes/track\#faq)

- ### What is Multi-Object Tracking and how does Ultralytics YOLO support it?








Multi-object tracking in video analytics involves both identifying objects and maintaining a unique ID for each detected object across video frames. Ultralytics YOLO supports this by providing real-time tracking along with object IDs, facilitating tasks such as security surveillance and sports analytics. The system uses trackers such as [BoT-SORT](https://github.com/NirAharon/BoT-SORT), [ByteTrack](https://github.com/FoundationVision/ByteTrack), OC-SORT, Deep OC-SORT, FastTracker, and TrackTrack, which can be configured via YAML files.

- ### Can I store the tracker inside a YOLO model file?








No. Standard Ultralytics `.pt` files store the YOLO model weights, while the tracker is created at inference time by [`model.track()`](https://docs.ultralytics.com/reference/engine/model#ultralytics.engine.model.Model.track). Track IDs depend on tracker state across consecutive frames, so a single standalone image can return detections such as boxes, classes, and confidences, but it cannot produce meaningful persistent tracking IDs by itself.



For deployment, package the detector and tracker together in your application and call `model.track()` frame by frame with `persist=True` when frames come from the same video stream. Use separate model or tracker instances for unrelated streams so state does not carry over between videos.

- ### How do I configure a custom tracker for Ultralytics YOLO?








You can configure a custom tracker by copying an existing tracker configuration file (e.g., `custom_tracker.yaml`) from the [Ultralytics tracker configuration directory](https://github.com/ultralytics/ultralytics/tree/main/ultralytics/cfg/trackers) and modifying parameters as needed, except for the `tracker_type`. Use this file in your tracking model like so:



Example







PythonCLI







```
from ultralytics import YOLO

model = YOLO("yolo26n.pt")
results = model.track(source="https://youtu.be/LNwODJXcvt4", tracker="custom_tracker.yaml")
```

- ### How can I run object tracking on multiple video streams simultaneously?








To run object tracking on multiple video streams simultaneously, you can use Python's `threading` module. Each thread will handle a separate video stream. Here's an example of how you can set this up:



Multithreaded Tracking







```
import threading

import cv2

from ultralytics import YOLO

# Define model names and video sources
MODEL_NAMES = ["yolo26n.pt", "yolo26n-seg.pt"]
SOURCES = ["path/to/video.mp4", "0"]  # local video, 0 for webcam

def run_tracker_in_thread(model_name, filename):
      """Run YOLO tracker in its own thread for concurrent processing.

      Args:
          model_name (str): Model checkpoint name or path loaded inside the thread.
          filename (str): The path to the video file or the identifier for the webcam/external camera source.
      """
      model = YOLO(model_name)
      results = model.track(filename, save=True, stream=True)
      for r in results:
          pass

# Create and start tracker threads using a for loop
tracker_threads = []
for video_file, model_name in zip(SOURCES, MODEL_NAMES):
      thread = threading.Thread(target=run_tracker_in_thread, args=(model_name, video_file), daemon=True)
      tracker_threads.append(thread)
      thread.start()

# Wait for all tracker threads to finish
for thread in tracker_threads:
      thread.join()

# Clean up and close windows
cv2.destroyAllWindows()
```

- ### What are the real-world applications of multi-object tracking with Ultralytics YOLO?








Multi-object tracking with Ultralytics YOLO has numerous applications, including:



  - **Transportation:** Vehicle tracking for traffic management and [autonomous driving](https://www.ultralytics.com/blog/ai-in-self-driving-cars).
  - **Retail:** People tracking for in-store analytics and security.
  - **Aquaculture:** Fish tracking for monitoring aquatic environments.
  - **Sports Analytics:** Tracking players and equipment for performance analysis.
  - **Security Systems:** [Monitoring suspicious activities](https://www.ultralytics.com/blog/security-alarm-system-projects-with-ultralytics-yolov8) and creating [security alarms](https://docs.ultralytics.com/guides/security-alarm-system).

These applications benefit from Ultralytics YOLO's ability to process high-frame-rate videos in real time with exceptional accuracy.

- ### How can I visualize object tracks over multiple video frames with Ultralytics YOLO?








To visualize object tracks over multiple video frames, you can use the YOLO model's tracking features along with OpenCV to draw the paths of detected objects. Here's an example script that demonstrates this:



Plotting tracks over multiple video frames







```
from collections import defaultdict

import cv2
import numpy as np

from ultralytics import YOLO

model = YOLO("yolo26n.pt")
video_path = "path/to/video.mp4"
cap = cv2.VideoCapture(video_path)
track_history = defaultdict(list)

while cap.isOpened():
      success, frame = cap.read()
      if success:
          result = model.track(frame, persist=True)[0]
          annotated_frame = result.plot()
          if result.boxes and result.boxes.is_track:
              boxes = result.boxes.xywh.cpu()
              track_ids = result.boxes.id.int().cpu().tolist()
              for box, track_id in zip(boxes, track_ids):
                  x, y, w, h = box
                  track = track_history[track_id]
                  track.append((float(x), float(y)))
                  if len(track) > 30:
                      track.pop(0)
                  points = np.hstack(track).astype(np.int32).reshape((-1, 1, 2))
                  cv2.polylines(annotated_frame, [points], isClosed=False, color=(230, 230, 230), thickness=10)
          cv2.imshow("YOLO26 Tracking", annotated_frame)
          if cv2.waitKey(1) & 0xFF == ord("q"):
              break
      else:
          break
cap.release()
cv2.destroyAllWindows()
```







This script will plot the tracking lines showing the movement paths of the tracked objects over time, providing valuable insights into object behavior and patterns.


Contributors

[Edit page on GitHub](https://github.com/ultralytics/ultralytics/blob/main/docs/en/modes/track.md)

[![glenn-jocher](https://avatars.githubusercontent.com/u/26833433?s=48)glenn-jocher36](https://github.com/glenn-jocher) [![raimbekovm](https://avatars.githubusercontent.com/u/144048515?s=48)raimbekovm7](https://github.com/raimbekovm) [![RizwanMunawar](https://avatars.githubusercontent.com/u/62513924?s=48)RizwanMunawar5](https://github.com/RizwanMunawar) [![onuralpszr](https://avatars.githubusercontent.com/u/1688848?s=48)onuralpszr4](https://github.com/onuralpszr) [![Y-T-G](https://avatars.githubusercontent.com/u/32206511?s=48)Y-T-G2](https://github.com/Y-T-G) [![JESUSROYETH](https://avatars.githubusercontent.com/u/42451234?s=48)JESUSROYETH1](https://github.com/JESUSROYETH) [![oaslananka](https://avatars.githubusercontent.com/u/285490571?s=48)oaslananka1](https://github.com/oaslananka) [![joeydufourd](https://avatars.githubusercontent.com/u/231624044?s=48)joeydufourd1](https://github.com/joeydufourd) [![him2him2](https://avatars.githubusercontent.com/u/10393491?s=48)him2him21](https://github.com/him2him2) [![pderrenger](https://avatars.githubusercontent.com/u/107626595?s=48)pderrenger1](https://github.com/pderrenger) [![Laughing-q](https://avatars.githubusercontent.com/u/61612323?s=48)Laughing-q1](https://github.com/Laughing-q) [![ankanpy](https://avatars.githubusercontent.com/u/79740115?s=48)ankanpy1](https://github.com/ankanpy) [![MatthewNoyce](https://avatars.githubusercontent.com/u/131261051?s=48)MatthewNoyce1](https://github.com/MatthewNoyce) [![IvorZhu331](https://avatars.githubusercontent.com/u/130829914?s=48)IvorZhu3311](https://github.com/IvorZhu331) [![Burhan-Q](https://avatars.githubusercontent.com/u/62214284?s=48)Burhan-Q1](https://github.com/Burhan-Q)

CreatedNov 12, 2023Updated1 week ago

## Comments

On This Page

[Why Choose Ultralytics YOLO for Object Tracking?](https://docs.ultralytics.com/modes/track#why-choose-ultralytics-yolo-for-object-tracking) [Real-world Applications](https://docs.ultralytics.com/modes/track#real-world-applications) [Quick Start](https://docs.ultralytics.com/modes/track#quick-start) [Supported Trackers](https://docs.ultralytics.com/modes/track#supported-trackers) [Which Tracker Should I Use?](https://docs.ultralytics.com/modes/track#which-tracker-should-i-use) [Switching Trackers](https://docs.ultralytics.com/modes/track#switching-trackers) [Configuration](https://docs.ultralytics.com/modes/track#configuration) [Tracking Arguments](https://docs.ultralytics.com/modes/track#tracking-arguments) [Custom Tracker Configuration](https://docs.ultralytics.com/modes/track#custom-tracker-configuration) [Shared Tracker Arguments](https://docs.ultralytics.com/modes/track#shared-tracker-arguments) [Enabling Re-Identification (ReID)](https://docs.ultralytics.com/modes/track#enabling-re-identification-reid) [Tracker Details](https://docs.ultralytics.com/modes/track#tracker-details) [BoT-SORT](https://docs.ultralytics.com/modes/track#bot-sort) [ByteTrack](https://docs.ultralytics.com/modes/track#bytetrack) [OC-SORT](https://docs.ultralytics.com/modes/track#oc-sort) [Deep OC-SORT](https://docs.ultralytics.com/modes/track#deep-oc-sort) [FastTracker](https://docs.ultralytics.com/modes/track#fasttracker) [TrackTrack](https://docs.ultralytics.com/modes/track#tracktrack) [Python Examples](https://docs.ultralytics.com/modes/track#python-examples) [Persisting Tracks Loop](https://docs.ultralytics.com/modes/track#persisting-tracks-loop) [Plotting Tracks Over Time](https://docs.ultralytics.com/modes/track#plotting-tracks-over-time) [Multithreaded Tracking](https://docs.ultralytics.com/modes/track#multithreaded-tracking) [Contribute New Trackers](https://docs.ultralytics.com/modes/track#contribute-new-trackers) [FAQ](https://docs.ultralytics.com/modes/track#faq) [What is Multi-Object Tracking and how does Ultralytics YOLO support it?](https://docs.ultralytics.com/modes/track#what-is-multi-object-tracking-and-how-does-ultralytics-yolo-support-it) [Can I store the tracker inside a YOLO model file?](https://docs.ultralytics.com/modes/track#can-i-store-the-tracker-inside-a-yolo-model-file) [How do I configure a custom tracker for Ultralytics YOLO?](https://docs.ultralytics.com/modes/track#how-do-i-configure-a-custom-tracker-for-ultralytics-yolo) [How can I run object tracking on multiple video streams simultaneously?](https://docs.ultralytics.com/modes/track#how-can-i-run-object-tracking-on-multiple-video-streams-simultaneously) [What are the real-world applications of multi-object tracking with Ultralytics YOLO?](https://docs.ultralytics.com/modes/track#what-are-the-real-world-applications-of-multi-object-tracking-with-ultralytics-yolo) [How can I visualize object tracks over multiple video frames with Ultralytics YOLO?](https://docs.ultralytics.com/modes/track#how-can-i-visualize-object-tracks-over-multiple-video-frames-with-ultralytics-yolo)

Explore with AI

[OpenAIOpen in ChatGPT](https://docs.ultralytics.com/modes/track.md?provider=openai) [ClaudeOpen in Claude](https://docs.ultralytics.com/modes/track.md?provider=anthropic) [GoogleOpen in Gemini](https://docs.ultralytics.com/modes/track.md?provider=gemini) [KimiOpen in Kimi](https://docs.ultralytics.com/modes/track.md?provider=kimi)

[Previous\\
\\
Model Export with Ultralytics YOLO](https://docs.ultralytics.com/modes/export) [Next\\
\\
Model Benchmarking with Ultralytics YOLO](https://docs.ultralytics.com/modes/benchmark)

Ask AIUltralytics