# components/common 사용법

공통 부품입니다. 스타일은 `styles/designGuide.css`의 클래스 사용.
아이콘은 `Icons.js`에서 가져옵니다.

## Button
```jsx
<Button>분양받기</Button>
<Button variant="secondary" href="/letter">편지 쓰기</Button>
<Button block small onClick={...}>단어장에 담기</Button>
```

## IconButton (label 필수)
```jsx
<IconButton label="알림"><IconBell /></IconButton>
<IconButton label="뒤로" variant="plain"><IconBack /></IconButton>
<IconButton label="보내기" variant="send" disabled={loading}><IconSend /></IconButton>
```

## Card / SeasonCard
```jsx
<Card>내용</Card>
<Card variant="diary" href="/diary/18">일기 미리보기</Card>
<SeasonCard season="spring">홍이 카드</SeasonCard>
```

## PhotoPlaceholder
```jsx
<PhotoPlaceholder />
<PhotoPlaceholder style={{ height: 180 }}>아직 사진이 없어요</PhotoPlaceholder>
```

## TopBar (클라이언트 컴포넌트)
```jsx
<TopBar title="홍이에게 편지" />
<TopBar title="18주차 일기" backHref="/timeline" />
```

## TabBar (클라이언트 컴포넌트)
```jsx
<TabBar currentWeek={tree.currentWeek} />
```