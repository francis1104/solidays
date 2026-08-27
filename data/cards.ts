export type Card = {
  id: number
  song: string
  album: string
  content: string
  /** 默认在解析层视为「陳奕迅」；第三方 API 仍以返回的 artist 为准 */
  artist?: string
  /**
   * 私有 R2 object key，必须落在 /media 白名单前缀下。
   * 例：'music/ge-song.mp3'
   * 未上传时省略；解析器走第三方 API 或判无音频。
   */
  audioKey?: string
  /** 封面 key，例：'music/covers/ge-song.jpg'。可与音频不同批上传。 */
  coverKey?: string
}

// Static homepage content for the current Worker build. Replace this source with D1 when
// structured content is ready; the homepage does not need a client-side fetch for this data.
export const defaultCards: Card[] = [
  {
    id: 0,
    song: '歌頌',
    album: '《Solidays 新曲+精選》',
    content: '風景裡隨身聽\n思想裡隨心聽\n懷著萬萬個心的結晶\n煉成時代 最亮發聲。',
    artist: '陳奕迅',
    audioKey: 'music/ge-song.mp3',
  },
  {
    id: 1,
    song: '昨日',
    album: '《天佑愛人》',
    content: '但是昨日 昨日並未真的飄走\n人物角色春與秋 始終心中跟我走\n愈舊愈似好的酒 好的酒',
    artist: '陳奕迅',
    audioKey: 'music/zuo-ri.mp3',
  },
  {
    id: 2,
    song: '今日',
    album: '《天佑愛人》',
    content: '抬頭吧黑暗過　會是晨曦\n懷著樂觀　總有轉機\n今天珍惜今天　逢凝望我心所愛的你',
    artist: '陳奕迅',
    audioKey: 'music/jin-ri.mp3',
  },
  {
    id: 3,
    song: '每一個明天',
    album: '《天佑愛人》',
    content:
      '每望向將來　都找到你\n我所夢　我所期　全部喝彩因你起\n你是我將來　不捨不棄　我的明天創自你',
    artist: '陳奕迅',
    audioKey: 'music/mei-yi-ge-ming-tian.mp3',
  },
]
