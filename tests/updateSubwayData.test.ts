import { describe, expect, it } from 'vitest';
import { decodeKorean, fileDate, parseFileRows, pickNewestCsv, targetName, DATASETS } from '../scripts/updateSubwayData';

/** 서울 열린데이터광장 OA-12034 자료 페이지의 '파일내려받기' 표 (2026-11-25에 읽은 실제 모양, 일부) + 시험용으로 더한 행 */
const row = (n: number, kind: string, name: string, seq: string, size: string, date: string) => `
										<tr id="fileTr_${n}">
											<td>${n}</td>
											<td>${kind}</td>
											<td class="align-l" style="cursor:pointer"><span title="${name}" onclick="javascript:downloadFile('${seq}');">${name}</span></td>
											<td>${size}</td>
											<td>${date}</td>
											<td><a href="javascript:downloadFile('${seq}');" title="${name}"><span class="hide">${name} 다운로드</span></a></td>
										</tr>`;
const HTML = `<html><body><table>
${row(1, '데이터', '서울교통공사 역간거리 및 소요시간_240810.csv', '9', '0.01', '2024.09.02.')}
${row(2, '데이터', '서울교통공사_역간거리 및 소요시간_20230614.csv', '6', '0.01', '2023.06.15.')}
</table><script>function downloadFile(seqNo) { document.frmFile.seq.value = seqNo; }</script></body></html>`;

describe('서울시 자료 페이지 읽기', () => {
  it('파일 표에서 번호·종류·이름·수정일을 읽는다 (스크립트 속 함수 정의는 행으로 세지 않는다)', () => {
    const files = parseFileRows(HTML);
    expect(files).toEqual([
      { seq: '9', kind: '데이터', name: '서울교통공사 역간거리 및 소요시간_240810.csv', modified: '2024-09-02' },
      { seq: '6', kind: '데이터', name: '서울교통공사_역간거리 및 소요시간_20230614.csv', modified: '2023-06-15' },
    ]);
  });

  it('표가 없거나 모양이 바뀌면 빈 목록 (그러면 갱신이 이유를 적고 멈춘다)', () => {
    expect(parseFileRows('<html>점검 중입니다</html>')).toEqual([]);
    expect(parseFileRows(HTML.replace(/downloadFile\('\d+'\);">/g, 'x">'))).toEqual([]);
  });

  it('수정일이 가장 늦은 CSV를 고른다. 명세서·xlsx·hwpx는 건너뛴다', () => {
    const files = parseFileRows(
      [
        row(1, '명세서', '컬럼정의.csv', '20', '0.01', '2026.10.01.'),
        row(2, '데이터', '새 자료.xlsx', '19', '0.01', '2026.09.01.'),
        row(3, '데이터', '서울교통공사_자료_20260801.csv', '18', '0.01', '2026.08.05.'),
        row(4, '데이터', '서울교통공사_자료_20250101.csv', '5', '0.01', '2025.01.02.'),
      ].join('\n'),
    );
    expect(pickNewestCsv(files)?.seq).toBe('18');
    expect(pickNewestCsv([])).toBeNull();
  });

  it('저장 이름의 날짜: 이름 속 6자리/8자리 날짜, 없으면 수정일', () => {
    const f = (name: string, modified = '2026-11-01') => ({ seq: '1', kind: '데이터', name, modified });
    expect(fileDate(f('서울교통공사 역간거리 및 소요시간_240810.csv'))).toBe('20240810');
    expect(fileDate(f('서울교통공사_환승역거리 소요시간 정보_20250331.csv'))).toBe('20250331');
    expect(fileDate(f('서울교통공사_환승역거리 소요시간 정보.csv'))).toBe('20261101');
    expect(targetName(DATASETS[0].prefix, f('x_240810.csv'))).toBe('역간거리_및_소요시간_20240810.csv');
  });

  it('EUC-KR(CP949) 글자를 읽고, UTF-8도 그대로 읽는다', () => {
    expect(decodeKorean(Uint8Array.from([0xbc, 0xad, 0xbf, 0xef]))).toBe('서울');
    expect(decodeKorean(new TextEncoder().encode('서울역'))).toBe('서울역');
    expect(decodeKorean(Uint8Array.from([0xef, 0xbb, 0xbf, 0x41]))).toBe('A');
  });
});
