// 서울교통공사 공개 자료로 만든 지하철 지도(src/data/subwayGraph.json)의 모양.
// 만드는 곳: scripts/buildSubwayGraph.ts, 쓰는 곳: src/services/subwayRouter.ts

/** [역ID("호선|역이름"), 호선, 역이름, 경도, 위도, 외부역코드]  (좌표·코드가 없으면 null) */
export type StationTuple = [string, number, string, number | null, number | null, string | null];
/** [출발역ID, 도착역ID, 걸리는 초, 거리 m, 한 방향만(1) 또는 양방향(0), 이 구간을 다니는 열차 종류들] */
export type RideTuple = [string, string, number, number, 0 | 1, number[]];
/** [역ID, 역ID, 걸어서 갈아타는 초, 거리 m]  같은 이름의 다른 호선 사이 */
export type TransferTuple = [string, string, number, number];
/** [역ID, 열차 종류A, 열차 종류B, 초, 거리 m]  같은 호선 안에서 다른 갈래 열차로 갈아타기 */
export type SvcTransferTuple = [string, number, number, number, number];

export interface SubwayGraph {
  meta: { sources: string[]; stationCount: number; note: string; unusedCoords: string[] };
  stations: StationTuple[];
  rides: RideTuple[];
  transfers: TransferTuple[];
  svcTransfers: SvcTransferTuple[];
}
