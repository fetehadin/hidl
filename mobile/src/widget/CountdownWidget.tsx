import { FlexWidget, ListWidget, SvgWidget, TextWidget } from 'react-native-android-widget';
import { FONT, LOOKS, type Look, type LookName } from './look';
import { accentOf, checkSvg, chevronSvg, hidiHeight, hidiSvg, kindSvg } from './hidi';
import { describe, type Mood, type Shown, type WidgetCountdown } from './mood';

/** The three entries in the widget picker (app.json). "Countdown" is the original, kept so
 *  widgets already on home screens keep working; it's the medium one. */
export const WIDGET_NAMES = ['CountdownSmall', 'Countdown', 'CountdownLarge'] as const;
export const WIDGET_NAME = 'Countdown';

/** clickAction names, handled in task-handler.tsx. */
export const PREV = 'PREV_COUNTDOWN';
export const NEXT = 'NEXT_COUNTDOWN';
export const SELECT = 'SELECT_COUNTDOWN';

export type Size = { width: number; height: number };
export type WidgetItem = WidgetCountdown & { id?: string };

export type WidgetProps =
  | { state: 'ready'; items: WidgetItem[]; index: number; tz?: string; now: number; stale?: boolean; size: Size; look: LookName }
  | { state: 'empty'; connected: boolean; size: Size; look: LookName }
  | { state: 'error'; message: string; size: Size; look: LookName };

/**
 * The size breakpoints: what's drawn depends on the widget's real size, so any of the three
 * picker entries stays readable when resized.
 */
export function layoutFor(size: Size): 'small' | 'medium' | 'tall' | 'large' {
  if (size.width < 230) return 'small';
  if (size.height >= 280) return 'large';
  if (size.height >= 200) return 'tall';
  return 'medium';
}

/** Opens the website page for one countdown in the app (App.tsx handles hidl://open). */
export function countdownUri(id?: string) {
  return `hidl://open?path=${encodeURIComponent(id ? `/countdown#c-${id}` : '/countdown')}`;
}

/**
 * The hidl home-screen widget, "chunky" style: a teal (or near-black) frame, a white (or lighter)
 * card on a darker bottom edge like a pressed button, Hidi in a mood that follows the date, and
 * big rounded numbers. Drawn to a picture by react-native-android-widget, so only its primitives
 * work here, and nothing animates or ticks between redraws.
 */
export function CountdownWidget(props: WidgetProps) {
  const look = LOOKS[props.look];
  const layout = layoutFor(props.size);

  let body: React.JSX.Element;
  if (props.state !== 'ready' || props.items.length === 0) {
    body = <EmptyCard look={look} layout={layout} props={props} />;
  } else {
    const item = props.items[props.index];
    const shown = describe(item, props.now, props.tz);
    const common = { look, item, shown, tz: props.tz };
    body =
      layout === 'small' ? (
        <SmallCard {...common} count={props.items.length} index={props.index} />
      ) : layout === 'large' ? (
        <FlexWidget style={{ width: 'match_parent', height: 'match_parent', flexDirection: 'column' }}>
          <TopRow look={look} count={props.items.length} index={props.index} stale={props.stale} />
          <FeaturedCard {...common} tall />
          <ListCard look={look} items={props.items} index={props.index} now={props.now} tz={props.tz} />
        </FlexWidget>
      ) : (
        <FlexWidget style={{ width: 'match_parent', height: 'match_parent', flexDirection: 'column' }}>
          <TopRow look={look} count={props.items.length} index={props.index} stale={props.stale} line={layout === 'medium' ? shown : undefined} />
          <FeaturedCard {...common} tall={layout === 'tall'} />
        </FlexWidget>
      );
  }

  const flips = props.state === 'ready' && props.items.length > 1;
  return (
    <FlexWidget
      // The small widget flips on a tap; the others open hidl from anywhere outside the buttons.
      clickAction={layout === 'small' && flips ? NEXT : 'OPEN_APP'}
      accessibilityLabel="hidl countdowns"
      style={{
        width: 'match_parent',
        height: 'match_parent',
        backgroundColor: look.bg,
        borderRadius: 28,
        padding: layout === 'small' ? 8 : 10,
        flexDirection: 'column',
      }}
    >
      {body}
    </FlexWidget>
  );
}

// ---- building blocks

/** A white (or lighter) card on a darker edge that's 5dp thicker at the bottom: a pressed button. */
function Chunky({ look, children, flex, clickAction, uri, marginTop = 0, padding = 12 }: {
  look: Look; children: React.ReactNode; flex?: number; clickAction?: string; uri?: string; marginTop?: number; padding?: number;
}) {
  return (
    <FlexWidget
      clickAction={clickAction ?? (uri ? 'OPEN_URI' : undefined)}
      clickActionData={uri ? { uri } : undefined}
      style={{ width: 'match_parent', ...(flex ? { flex } : {}), marginTop, backgroundColor: look.edge, borderRadius: 22, paddingBottom: 5 }}
    >
      <FlexWidget style={{ width: 'match_parent', ...(flex ? { flex: 1 } : {}), backgroundColor: look.card, borderRadius: 22, padding, flexDirection: 'column' }}>
        {children}
      </FlexWidget>
    </FlexWidget>
  );
}

function Hidi({ mood, width }: { mood: Mood; width: number }) {
  return <SvgWidget svg={hidiSvg(mood)} style={{ width, height: hidiHeight(width) }} />;
}

function Text({ text, size, color, font = FONT.round, lines = 1, align, marginTop, flex }: {
  text: string; size: number; color: string; font?: string; lines?: number; align?: 'left' | 'center' | 'right'; marginTop?: number; flex?: number;
}) {
  return (
    <TextWidget
      text={text}
      maxLines={lines}
      truncate="END"
      allowFontScaling={false}
      style={{ fontSize: size, color: color as `#${string}`, fontFamily: font, ...(align ? { textAlign: align } : {}), ...(marginTop ? { marginTop } : {}), ...(flex ? { flex } : {}) }}
    />
  );
}

/** "hidl", and the chunky ‹ › with page dots when there's more than one countdown. */
function TopRow({ look, count, index, stale, line }: { look: Look; count: number; index: number; stale?: boolean; line?: Shown }) {
  return (
    <FlexWidget style={{ width: 'match_parent', height: 44, flexDirection: 'row', alignItems: 'center' }}>
      {line ? (
        // Short widgets: Hidi and the speech line live up here, so the card keeps its big number.
        <FlexWidget style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
          <Hidi mood={line.mood} width={30} />
          <FlexWidget style={{ flex: 1, marginLeft: 6, backgroundColor: look.card, borderRadius: 12, paddingHorizontal: 9, paddingVertical: 5 }}>
            <Text text={line.line} size={12} color={look.text} />
          </FlexWidget>
        </FlexWidget>
      ) : (
        <FlexWidget style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
          <Hidi mood="calm" width={24} />
          <Text text="hidl" size={18} color={look.onBg} font={FONT.roundHeavy} />
          {stale && <Text text=" · offline" size={10} color={look.onBg} font={FONT.mono} />}
        </FlexWidget>
      )}
      {count > 1 && (
        <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 2 }}>
          <Arrow look={look} dir="left" />
          <Dots look={look} count={count} index={index} />
          <Arrow look={look} dir="right" />
        </FlexWidget>
      )}
    </FlexWidget>
  );
}

/** 34dp visible, inside a 48dp-wide tap area. */
function Arrow({ look, dir }: { look: Look; dir: 'left' | 'right' }) {
  return (
    <FlexWidget
      clickAction={dir === 'left' ? PREV : NEXT}
      accessibilityLabel={dir === 'left' ? 'Previous countdown' : 'Next countdown'}
      style={{ width: 44, height: 44, justifyContent: 'center', alignItems: 'center' }}
    >
      <FlexWidget style={{ backgroundColor: look.buttonEdge, borderRadius: 12, paddingBottom: 3 }}>
        <FlexWidget style={{ width: 34, height: 31, backgroundColor: look.button, borderRadius: 12, justifyContent: 'center', alignItems: 'center' }}>
          <SvgWidget svg={chevronSvg(dir, look.text)} style={{ width: 20, height: 20 }} />
        </FlexWidget>
      </FlexWidget>
    </FlexWidget>
  );
}

function Dots({ look, count, index }: { look: Look; count: number; index: number }) {
  if (count > 6) return <Text text={`${index + 1}/${count}`} size={11} color={look.onBg} font={FONT.mono} />;
  return (
    <FlexWidget style={{ flexDirection: 'row', alignItems: 'center' }}>
      {Array.from({ length: count }, (_, i) => (
        <FlexWidget
          key={i}
          style={{ width: i === index ? 9 : 6, height: i === index ? 9 : 6, borderRadius: 5, marginHorizontal: 2, backgroundColor: i === index ? look.dot : look.dotOff }}
        />
      ))}
    </FlexWidget>
  );
}

function Bubble({ look, text, lines = 2 }: { look: Look; text: string; lines?: number }) {
  return (
    <FlexWidget style={{ flex: 1, marginLeft: 8, backgroundColor: look.bubble, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 7 }}>
      <Text text={text} size={13} color={look.text} lines={lines} />
    </FlexWidget>
  );
}

/** Big number with its unit chips: "5" [days] [21h]; a word on the day itself. */
function BigNumber({ look, shown, size }: { look: Look; shown: Shown; size: number }) {
  return (
    <FlexWidget style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Text text={shown.big} size={shown.bigIsWord ? Math.round(size * 0.62) : size} color={look.text} font={FONT.roundHeavy} />
      {shown.chips.length > 0 && (
        <FlexWidget style={{ flexDirection: 'column', marginLeft: 5 }}>
          {shown.chips.slice(0, 2).map((c, i) => (
            <FlexWidget key={c} style={{ backgroundColor: look.chip, borderRadius: 7, paddingHorizontal: 6, paddingVertical: 1, marginTop: i ? 3 : 0 }}>
              <Text text={c} size={10} color={look.text} font={FONT.mono} />
            </FlexWidget>
          ))}
        </FlexWidget>
      )}
    </FlexWidget>
  );
}

/** A thick rounded bar in the countdown's own color: how far from "made" to "the day". */
function Bar({ look, kind, progress, height = 10, marginTop = 8 }: { look: Look; kind: string; progress: number | null; height?: number; marginTop?: number }) {
  if (progress === null) return null;
  const filled = Math.round(progress * 1000);
  return (
    <FlexWidget style={{ width: 'match_parent', height, marginTop, backgroundColor: look.track, borderRadius: height / 2, flexDirection: 'row' }}>
      <FlexWidget style={{ flex: Math.max(filled, 40), height, backgroundColor: accentOf(kind) as `#${string}`, borderRadius: height / 2 }} />
      {filled < 1000 && <FlexWidget style={{ flex: 1000 - Math.max(filled, 40), height }} />}
    </FlexWidget>
  );
}

function TitleBlock({ look, item, tz, size = 15 }: { look: Look; item: WidgetItem; tz?: string; size?: number }) {
  return (
    <FlexWidget style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
      <SvgWidget svg={kindSvg(item.kind)} style={{ width: 26, height: 26 }} />
      <FlexWidget style={{ flex: 1, marginLeft: 7, flexDirection: 'column' }}>
        <Text text={item.title} size={size} color={look.text} />
        <Text text={dateOf(item.targetAt, tz)} size={10} color={look.muted} font={FONT.mono} />
      </FlexWidget>
    </FlexWidget>
  );
}

// ---- the layouts

/** Medium and tall: the countdown on show. Tall adds Hidi and the bubble inside the card. */
function FeaturedCard({ look, item, shown, tz, tall }: { look: Look; item: WidgetItem; shown: Shown; tz?: string; tall?: boolean }) {
  return (
    <Chunky look={look} flex={tall ? undefined : 1} uri={countdownUri(item.id)} marginTop={2} padding={tall ? 12 : 11}>
      {tall && (
        <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
          <Hidi mood={shown.mood} width={60} />
          <Bubble look={look} text={shown.line} />
        </FlexWidget>
      )}
      <FlexWidget style={{ width: 'match_parent', flex: tall ? undefined : 1, flexDirection: 'row', alignItems: 'center' }}>
        <TitleBlock look={look} item={item} tz={tz} />
        <BigNumber look={look} shown={shown} size={tall ? 40 : 36} />
      </FlexWidget>
      <Bar look={look} kind={item.kind} progress={shown.progress} />
    </Chunky>
  );
}

/** 2×2: Hidi, the big number, the title. A tap flips to the next one. */
function SmallCard({ look, item, shown, count, index }: { look: Look; item: WidgetItem; shown: Shown; count: number; index: number }) {
  return (
    <FlexWidget style={{ width: 'match_parent', height: 'match_parent', flexDirection: 'column' }}>
      <Chunky look={look} flex={1} padding={10}>
        <FlexWidget style={{ width: 'match_parent', flex: 1, flexDirection: 'row', alignItems: 'center' }}>
          <Hidi mood={shown.mood} width={44} />
          <FlexWidget style={{ flex: 1, marginLeft: 6, flexDirection: 'column' }}>
            <Text text={shown.big} size={shown.bigIsWord ? 18 : 30} color={look.text} font={FONT.roundHeavy} />
            {shown.chips[0] && <Text text={shown.chips[0]} size={10} color={look.muted} font={FONT.mono} />}
          </FlexWidget>
        </FlexWidget>
        <Text text={item.title} size={13} color={look.text} marginTop={4} />
        <Bar look={look} kind={item.kind} progress={shown.progress} height={7} marginTop={5} />
      </Chunky>
      {count > 1 && (
        <FlexWidget style={{ width: 'match_parent', height: 14, marginTop: 3, justifyContent: 'center', alignItems: 'center' }}>
          <Dots look={look} count={count} index={index} />
        </FlexWidget>
      )}
    </FlexWidget>
  );
}

/** 4×4: every countdown; tapping a row shows it at the top. */
function ListCard({ look, items, index, now, tz }: { look: Look; items: WidgetItem[]; index: number; now: number; tz?: string }) {
  return (
    <Chunky look={look} flex={1} marginTop={8} padding={8}>
      <ListWidget style={{ width: 'match_parent', height: 'match_parent' }}>
        {items.map((item, i) => (
          <FlexWidget
            key={item.id ?? `${item.title}-${i}`}
            clickAction={SELECT}
            clickActionData={{ index: i }}
            style={{ width: 'match_parent', height: 40, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6 }}
          >
            <SvgWidget svg={checkSvg(i === index, accentOf(item.kind), look.ring)} style={{ width: 20, height: 20 }} />
            <FlexWidget style={{ flex: 1, marginLeft: 9 }}>
              <Text text={item.title} size={14} color={look.text} />
            </FlexWidget>
            <Text text={describe(item, now, tz).short} size={11} color={look.muted} font={FONT.mono} />
          </FlexWidget>
        ))}
      </ListWidget>
    </Chunky>
  );
}

function EmptyCard({ look, layout, props }: { look: Look; layout: ReturnType<typeof layoutFor>; props: WidgetProps }) {
  const error = props.state === 'error';
  const connected = props.state === 'empty' ? props.connected : true;
  const title = error ? props.message : connected ? 'Add a countdown' : 'Open hidl to connect';
  const hint = error ? 'Tap to open hidl' : connected ? 'Hidi is ready to count with you!' : 'Sign in once and I’ll count for you.';
  const small = layout === 'small';
  return (
    <Chunky
      look={look}
      flex={1}
      padding={small ? 10 : 14}
      uri={connected && !error ? `hidl://open?path=${encodeURIComponent('/countdown/new')}` : undefined}
      clickAction={connected && !error ? undefined : 'OPEN_APP'}
    >
      <FlexWidget style={{ width: 'match_parent', flex: 1, flexDirection: small ? 'column' : 'row', alignItems: 'center', justifyContent: 'center' }}>
        <Hidi mood={error ? 'sleepy' : 'calm'} width={small ? 50 : 64} />
        <FlexWidget style={{ flex: small ? undefined : 1, marginLeft: small ? 0 : 12, marginTop: small ? 4 : 0, flexDirection: 'column' }}>
          <Text text={title} size={small ? 14 : 18} color={look.text} font={FONT.roundHeavy} lines={2} align={small ? 'center' : undefined} />
          {!small && <Text text={hint} size={12} color={look.muted} lines={2} marginTop={2} />}
        </FlexWidget>
      </FlexWidget>
    </Chunky>
  );
}

/** "THU 12 NOV" in the owner's zone; plain if this phone can't format time zones. */
function dateOf(targetAt: string, tz?: string) {
  const d = new Date(targetAt);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: tz }).replace(',', '').toUpperCase();
  } catch {
    return d.toDateString().slice(0, 10).toUpperCase();
  }
}
