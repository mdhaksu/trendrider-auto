# 트렌드라이다 · 자동 랭킹 스크래퍼

무신사 · 29CM · ZOZOTOWN 여성 랭킹을 **매일 자동으로 수집**해 대시보드로 보여줍니다.
GitHub Actions(무료 클라우드)에서 도니 **PC를 켜둘 필요가 없습니다.**

Claude(앱/코드)의 브라우징 정책과 무관하게, GitHub의 자체 서버에서 실행되므로 차단되던 사이트도 수집할 수 있습니다.

---

## 설치 (한 번만, 약 10분)

### 1. GitHub 계정 준비
[github.com](https://github.com) 가입 (이미 있으면 스킵).

### 2. 새 저장소(repository) 만들기
- 우측 상단 **+ → New repository**
- 이름: 예) `trendrider-auto`
- **Public** 선택 → **Create repository**

### 3. 이 폴더의 파일들을 업로드
방법 A (쉬움 · 드래그앤드롭)
- 저장소 페이지에서 **Add file → Upload files**
- 이 `trendrider-auto` 폴더 **안의 파일 전체**를 끌어다 놓기
  - ⚠️ `.github` 폴더(안의 `workflows/scrape.yml`)도 꼭 포함해야 합니다. 숨은 폴더라 안 보이면 방법 B 사용.
- **Commit changes**

방법 B (git 사용 가능하면)
```bash
cd trendrider-auto
git init && git add . && git commit -m "init"
git branch -M main
git remote add origin https://github.com/<내아이디>/trendrider-auto.git
git push -u origin main
```

### 4. GitHub Pages 켜기
- 저장소 **Settings → Pages**
- **Source** 를 **GitHub Actions** 로 선택 → 저장

### 5. 처음 한 번 수동 실행
- **Actions** 탭 → 워크플로우 실행 허용(초록 버튼) 클릭
- 좌측 **scrape-and-deploy** → 우측 **Run workflow** → **Run**
- 2~4분 뒤 완료(초록 체크)되면 대시보드 생성 완료

### 6. 대시보드 주소
```
https://<내아이디>.github.io/trendrider-auto/
```
(Actions의 deploy 단계 로그에도 주소가 찍힙니다.)

---

## 자동 실행
`.github/workflows/scrape.yml` 의 cron 에 따라 **매일 08:00 KST**(23:00 UTC)에 자동 수집·갱신됩니다.
시간을 바꾸려면 `cron: "0 23 * * *"` 의 숫자를 조정하세요 (UTC 기준, 분·시).

## 로컬에서 테스트 (선택)
```bash
npm install
npx playwright install chromium
node scrape.mjs        # public/data.json 생성
# public/index.html 을 브라우저로 열어 확인 (data.json 과 같은 폴더)
```

## 문제 해결
- **ZOZO 등 특정 플랫폼이 '수집 실패'로 뜰 때**: 사이트 구조가 바뀌었거나 봇 차단일 수 있습니다.
  Actions 실행 로그(해당 플랫폼의 `FAILED` 또는 `0 items` 줄)를 복사해 Claude에게 주시면 셀렉터를 고쳐드립니다.
- **GitHub Actions 데이터센터 IP가 차단**되는 사이트가 있으면(드묾), '내 PC 스케줄러' 방식으로 전환할 수 있습니다.

## 확장
`scrape.mjs` 에 사이트 함수를 추가하면 W컨셉·미국·유럽·동남아도 같은 방식으로 붙일 수 있습니다.
원하는 사이트를 알려주시면 스크래퍼 함수를 추가해 드립니다.
