export interface RednoteItemRootPayload {
  note: Note;
}

export interface Note {
  prevRouteData: Record<string, unknown>;
  prevRoute: string;
  commentTarget: Record<string, unknown>;
  isImgFullscreen: boolean;
  gotoPage: string;
  firstNoteId: string;
  autoOpenNote: boolean;
  topCommentId: string;
  noteDetailMap: Record<string, NoteDetail>;
  serverRequestInfo: ServerRequestInfo;
  volume: number;
  recommendVideoMap: Record<string, unknown>;
  videoFeedType: string;
  rate: number;
  currentNoteId: string;
  forceScrollToComment: boolean;
  mediaWidth: number;
  noteHeight: number;
}

export interface ServerRequestInfo {
  state: string;
  errorCode: number;
  errMsg: string;
}

export interface NoteDetail {
  comments: Comments;
  currentTime: number;
  note: NoteData;
}

export interface Comments {
  list: unknown[];
  cursor: string;
  hasMore: boolean;
  loading: boolean;
  firstRequestFinish: boolean;
}

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

export interface Stream {
  h265: StreamItem[];
  h266: StreamItem[];
  av1: StreamItem[];
  h264: StreamItem[];
}

export interface StreamItem {
  masterUrl: string;
  backupUrls: string[];
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
    /** 视频流 */
    stream: {
      av1: StreamVariant[];
      h264: StreamVariant[];
      h265: StreamVariant[];
      h266: StreamVariant[];
    };
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

  /** 流媒体信息（视频流、编码格式等） */
  stream: {
    /** AV1 编码流列表（可能为空） */
    av1: StreamInfo[];

    /** H.264 编码流列表 */
    h264: StreamInfo[];

    /** H.265 编码流列表（可能为空） */
    h265: StreamInfo[];

    /** H.266 编码流列表（可能为空） */
    h266: StreamInfo[];
  };

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
