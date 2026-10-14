// ============================================================================
// xhs CLI (`xhs <command> --json`) 输出结构
// ============================================================================

/** CLI 成功响应 */
export interface XhsCliSuccess<T> {
  ok: true;
  schema_version: string;
  data: T;
}

/** CLI 失败响应 (进程退出码非 0, 但 stdout 仍为该 JSON) */
export interface XhsCliFailure {
  ok: false;
  schema_version: string;
  error: {
    code: string;
    message: string;
  };
}

export type XhsCliResponse<T> = XhsCliSuccess<T> | XhsCliFailure;

/**
 * `xhs read --json` 的 data 字段。
 *
 * CLI 内部有两条通道:
 *   - feed API (带 xsec_token 时优先): 返回 {@link XhsFeedPayload}, 字段为 snake_case
 *   - HTML 兜底 (feed API 失败 / 无 token): 直接返回页面 state 里的 note 对象, 字段为 camelCase
 */
export type XhsReadData = XhsFeedPayload | Record<string, unknown>;

/** feed API 负载 */
export interface XhsFeedPayload {
  cursor_score: string;
  current_time: number;
  items: XhsFeedItem[];
}

export interface XhsFeedItem {
  id: string;
  model_type: string;
  ignore: boolean;
  /** 字段与 {@link NoteData} 一一对应, 仅命名为 snake_case */
  note_card: Record<string, unknown>;
}

// ============================================================================
// 归一化后的笔记数据 (camelCase)
// ============================================================================

export interface NoteData {
  xsecToken: string;
  noteId: string;
  type: "video" | "normal";
  tagList: Tag[];
  interactInfo: InteractInfo;
  imageList: ImagePayload[];
  video?: VideoPayload;
  atUserList: unknown[];
  time: number;
  lastUpdateTime: number;
  title: string;
  desc: string;
  user: User;
  shareInfo: ShareInfo;
}

export interface Tag {
  id: string;
  name: string;
  type: string;
}

export interface InteractInfo {
  likedCount: string;
  collected: boolean;
  collectedCount: string;
  commentCount: string;
  shareCount: string;
  followed: boolean;
  relation: string;
  liked: boolean;
}

export interface ImageItem {
  urlDefault: string;
  livePhoto: boolean;
  height: number;
  width: number;
  url: string;
  infoList: ImageInfo[];
  fileId: string;
  traceId: string;
  urlPre: string;
  stream: Stream;
}

export interface ImageInfo {
  imageScene: string;
  url: string;
}

/**
 * 视频流, 键为编码标签。
 *   - HTML state: h265 / h264 / av1 / h266
 *   - feed API (xhs CLI): EF5 (= h265) / EF4 (= h264) / EF6 / EF7
 */
export type Stream = Record<string, StreamItem[] | undefined>;

export interface StreamItem {
  masterUrl: string;
  backupUrls: string[];
  /** 清晰度; 同一编码下有多个版本时用于挑选最高分辨率 */
  width?: number;
  height?: number;
}

export interface User {
  userId: string;
  nickname: string;
  avatar: string;
  xsecToken: string;
}

export interface ShareInfo {
  unShare: boolean;
}

export interface VideoPayload {
  capa: {
    /** 视频时长（单位秒？） */
    duration: number;
  };
  consumer: {
    /** 原始视频 Key */
    originVideoKey: string;
  };
  media: {
    /** 视频唯一 ID */
    videoId: number | string;
    /** 视频元信息 */
    video: {
      md5: string;
      hdrType: number;
      drmType: number;
      streamTypes: number[];
      bizName: number;
      bizId: string;
      duration: number;
    };
    /** 视频流 (键名见 {@link Stream}) */
    stream: Record<string, StreamVariant[] | undefined>;
  };
  image: {
    /** 视频封面 / 缩略图文件 ID */
    thumbnailFileid: string;
  };
}

/** 视频流清晰度分支（如 h264、h265） */
export interface StreamVariant {
  streamDesc: string;
  width: number;
  height: number;
  masterUrl: string;
  backupUrls: string[];
  streamType: number;
  format: string;
  rotate: number;
  fps: number;
  videoCodec: string;
  audioCodec: string;
  qualityType: string;

  /** 音频相关 */
  audioBitrate: number;
  audioDuration: number;
  audioChannels: number;

  /** 视频相关 */
  videoBitrate: number;
  videoDuration: number;
  avgBitrate: number;
  size: number;
  psnr: number;
  ssim: number;
  vmaf: number;
  hdrType: number;
  duration: number;
  defaultStream: number;
  volume: number;
  weight: number;
}

export interface ImagePayload {
  /** 默认图片 URL */
  urlDefault: string;

  /** 流媒体信息 (实况图视频流; 键名见 {@link Stream}) */
  stream: Record<string, StreamInfo[] | undefined>;

  /** 是否为 Live Photo（动态照片） */
  livePhoto: boolean;

  /** 图片宽度（像素） */
  width: number;

  /** 预览图 URL */
  urlPre: string;

  /** 主图 URL（可能为空） */
  url: string;

  /** 跟踪 ID（trace） */
  traceId: string;

  /** 图片附加信息列表 */
  infoList: ImageInfo[];

  /** 文件 ID */
  fileId: string;

  /** 图片高度（像素） */
  height: number;
}

/** 单个视频流的基本信息 */
export interface StreamInfo {
  /** 主视频播放地址 */
  masterUrl: string;

  /** 备用地址列表 */
  backupUrls: string[];

  size: number;
}

/** 图片附加信息（不同场景下的版本） */
export interface ImageInfo {
  /** 图片链接 */
  url: string;

  /** 图片场景标识，例如 WB_PRV（预览）、WB_DFT（默认） */
  imageScene: string;
}
