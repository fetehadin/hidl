import { FlexWidget, ListWidget, SvgWidget, TextWidget } from 'react-native-android-widget';
import { FONT, LOOKS, skinFor, type Look, type LookName } from './look';
import { editSvg, hidiHeight, hidiSvg, kindSvg } from './hidi';
import { describe, type Mood, type Shown, type WidgetCountdown } from './mood';

/** The three entries in the widget picker (app.json). "Countdown" is the original, kept so
 *  widgets already on home screens keep working; it's the medium one. */
export const WIDGET_NAMES = ['CountdownSmall', 'Countdown', 'CountdownLarge'] as const;
export const WIDGET_NAME = 'Countdown';

/** clickAction names from older widget versions, still handled in task-handler.tsx (a widget
 *  drawn by an older version keeps its buttons until it's redrawn). */
export const PREV = 'PREV_COUNTDOWN';
export const NEXT = 'NEXT_COUNTDOWN';
export const SELECT = 'SELECT_COUNTDOWN';

export type Size = { width: number; height: number };
export type WidgetItem = WidgetCountdown & { id?: string };

type Common = { size: Size; look: LookName; widgetId?: number };
export type WidgetProps =
  | (Common & { state: 'ready'; items: WidgetItem[]; tz?: string; now: number; stale?: boolean })
  | (Common & { state: 'empty'; connected: boolean; nonePicked?: boolean })
  | (Common & { state: 'error'; message: string });

/**
 * The size breakpoints: what's drawn depends on the widget's real size, so any of the three
 * picker entries stays readable when resized.
 */
export function layoutFor(size: Size): 'small' | 'medium' | 'large' {
  if (size.width < 230) return 'small';
  if (size.height >= 280) return 'large';
  return 'medium';
}

/** Opens the website page for one countdown in the app (App.tsx handles hidl://open). */
export function countdownUri(id?: string) {
  return `hidl://open?path=${encodeURIComponent(id ? `/countdown#c-${id}` : '/countdown')}`;
}

/** Opens this widget's settings in the app: which countdowns it shows, and its look (App.tsx). */
export function settingsUri(widgetId?: number) {
  return widgetId === undefined ? 'hidl://widget' : `hidl://widget?id=${widgetId}`;
}

const KIND_LABEL: Record<string, string> = {
  exam: 'Exam',
  graduation: 'Graduation',
  birthday: 'Birthday',
  wedding: 'Wedding',
  work: 'Work',
  trip: 'Trip',
  life: 'Life',
};

/**
 * The Hidl home-screen widget, a stack of cards: every countdown fills the whole widget, and you
 * scroll up or down to the next one (like a stack of widgets on an iPhone). Each card is one huge
 * number, what it's for, a thin bar of how far along it is, and Hidi, whose mood follows the date
 * and colors the card (gold on the day, slate once it's passed). The large size is a list.
 *
 * Drawn to pictures by react-native-android-widget, so only its primitives work here (no React
 * Native views, no fragments), and nothing ticks between redraws.
 */
export function CountdownWidget(props: WidgetProps) {
  const look = LOOKS[props.look];
  const layout = layoutFor(props.size);

  let body: React.JSX.Element;
  if (props.state !== 'ready' || props.items.length === 0) {
    body = <EmptyCard look={look} small={layout === 'small'} props={props} />;
  } else if (layout === 'large') {
    body = <LargeList look={look} props={props} />;
  } else {
    const { items, now, tz } = props;
    body = (
      <ListWidget style={{ width: 'match_parent', height: 'match_parent' }}>
        {items.map((item, i) => {
          const page = {
            look,
            item,
            shown: describe(item, now, tz),
            index: i,
            count: items.length,
            tz,
            widgetId: props.widgetId,
            stale: props.stale,
            height: props.size.height,
          };
          const key = item.id ?? `${item.title}-${i}`;
          return layout === 'small' ? <SmallPage key={key} {...page} /> : <MediumPage key={key} {...page} />;
        })}
      </ListWidget>
    );
  }

  return (
    <FlexWidget
      clickAction="OPEN_APP"
      accessibilityLabel="Hidl countdowns"
      style={{
        width: 'match_parent',
        height: 'match_parent',
        borderRadius: 28,
        backgroundGradient: { from: look.from, to: look.to, orientation: 'TL_BR' },
        flexDirection: 'column',
      }}
    >
      {body}
    </FlexWidget>
  );
}

// ---- building blocks

type PageProps = {
  look: Look;
  item: WidgetItem;
  shown: Shown;
  index: number;
  count: number;
  tz?: string;
  widgetId?: number;
  stale?: boolean;
  height: number;
};

/** One countdown's card: fills the list, in its mood's colors, and opens that countdown. */
function Page({ look, item, shown, padding, children }: { look: Look; item: WidgetItem; shown: Shown; padding: number; children: React.ReactNode }) {
  const skin = skinFor(look, shown.mood);
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: countdownUri(item.id) }}
      accessibilityLabel={`${item.title}: ${shown.short}`}
      style={{
        width: 'match_parent',
        height: 'match_parent',
        borderRadius: 28,
        backgroundGradient: { from: skin.from, to: skin.to, orientation: 'TL_BR' },
        padding,
        flexDirection: 'column',
      }}
    >
      {children}
    </FlexWidget>
  );
}

function Hidi({ mood, width }: { mood: Mood; width: number }) {
  return <SvgWidget svg={hidiSvg(mood)} style={{ width, height: hidiHeight(width) }} />;
}

function Text({ text, size, color, font = FONT.round, lines = 1, align, marginTop, marginLeft, flex }: {
  text: string; size: number; color: string; font?: string; lines?: number; align?: 'left' | 'center' | 'right'; marginTop?: number; marginLeft?: number; flex?: number;
}) {
  return (
    <TextWidget
      text={text}
      maxLines={lines}
      truncate="END"
      allowFontScaling={false}
      style={{
        fontSize: size,
        color: color as `#${string}`,
        fontFamily: font,
        ...(align ? { textAlign: align } : {}),
        ...(marginTop ? { marginTop } : {}),
        ...(marginLeft ? { marginLeft } : {}),
        ...(flex ? { flex } : {}),
      }}
    />
  );
}

/** The kind's icon on its colored tile, and its name: "EXAM", "TRIP". */
function KindTag({ look, kind, size = 10 }: { look: Look; kind: string; size?: number }) {
  return (
    <FlexWidget style={{ flexDirection: 'row', alignItems: 'center' }}>
      <SvgWidget svg={kindSvg(kind)} style={{ width: size + 8, height: size + 8 }} />
      <Text text={(KIND_LABEL[kind] ?? 'Countdown').toUpperCase()} size={size} color={look.soft} font={FONT.mono} marginLeft={5} />
    </FlexWidget>
  );
}

/** A round glass button with the sliders icon: this widget's settings (which countdowns, look). */
function EditButton({ look, widgetId, size = 32 }: { look: Look; widgetId?: number; size?: number }) {
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: settingsUri(widgetId) }}
      accessibilityLabel="Choose countdowns for this widget"
      // A tap area bigger than the button, so it's easy to hit.
      style={{ width: size + 12, height: size + 12, justifyContent: 'center', alignItems: 'center' }}
    >
      <FlexWidget
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: look.glass,
          borderColor: look.glassLine,
          borderWidth: 1,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <SvgWidget svg={editSvg(look.text)} style={{ width: Math.round(size * 0.55), height: Math.round(size * 0.55) }} />
      </FlexWidget>
    </FlexWidget>
  );
}

/** Where you are in the stack, standing up, so it says "scroll up and down". */
function StackDots({ look, count, index }: { look: Look; count: number; index: number }) {
  if (count < 2) return null;
  if (count > 7) return <Text text={`${index + 1}/${count}`} size={10} color={look.soft} font={FONT.mono} />;
  return (
    <FlexWidget style={{ flexDirection: 'column', alignItems: 'center' }}>
      {Array.from({ length: count }, (_, i) => (
        <FlexWidget
          key={i}
          style={{ width: 5, height: i === index ? 14 : 5, borderRadius: 3, marginVertical: 2, backgroundColor: i === index ? look.dot : look.dotOff }}
        />
      ))}
    </FlexWidget>
  );
}

/** The big number with its units beside it: "3" days / 20h; a word on the day itself. */
function BigNumber({ look, shown, size }: { look: Look; shown: Shown; size: number }) {
  const [unit, ...rest] = shown.chips;
  return (
    <FlexWidget style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Text text={shown.big} size={shown.bigIsWord ? Math.round(size * 0.55) : size} color={look.text} font={FONT.roundHeavy} />
      {unit && (
        <FlexWidget style={{ flexDirection: 'column', marginLeft: 8 }}>
          <Text text={unit} size={Math.round(size * 0.28)} color={look.text} font={FONT.roundHeavy} />
          {rest.length > 0 && <Text text={rest.slice(0, 2).join(' ')} size={Math.round(size * 0.24)} color={look.soft} />}
        </FlexWidget>
      )}
    </FlexWidget>
  );
}

/** A thin white bar: how far from "made" to "the day". */
function Bar({ look, progress, height = 6, marginTop = 10 }: { look: Look; progress: number | null; height?: number; marginTop?: number }) {
  if (progress === null) return null;
  const filled = Math.max(Math.round(progress * 1000), 30);
  return (
    <FlexWidget style={{ width: 'match_parent', height, marginTop, backgroundColor: look.track, borderRadius: height / 2, flexDirection: 'row' }}>
      <FlexWidget style={{ flex: filled, height, backgroundColor: look.fill, borderRadius: height / 2 }} />
      {filled < 1000 && <FlexWidget style={{ flex: 1000 - filled, height }} />}
    </FlexWidget>
  );
}

/** Hidi's line, in a white bubble. */
function Bubble({ look, text, size = 13 }: { look: Look; text: string; size?: number }) {
  return (
    <FlexWidget style={{ backgroundColor: look.bubble, borderRadius: 14, paddingHorizontal: 11, paddingVertical: 5 }}>
      <Text text={text} size={size} color={look.bubbleText} />
    </FlexWidget>
  );
}

// ---- the layouts

/**
 * 4×2: Hidi's line and the settings button on top; the big number, what it's for and when on
 * the left; Hidi big on the right; the stack dots at the edge; the bar along the bottom.
 */
function MediumPage({ look, item, shown, index, count, tz, widgetId, stale, height }: PageProps) {
  const roomy = height >= 200;
  const hidi = roomy ? 92 : height >= 160 ? 76 : 60;
  return (
    <Page look={look} item={item} shown={shown} padding={roomy ? 16 : 12}>
      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center' }}>
        <FlexWidget style={{ flex: 1, flexDirection: 'row' }}>
          <Bubble look={look} text={stale ? 'Offline: counting from my last look.' : speech(shown)} size={roomy ? 13 : 12} />
        </FlexWidget>
        <EditButton look={look} widgetId={widgetId} size={roomy ? 32 : 28} />
      </FlexWidget>

      <FlexWidget style={{ width: 'match_parent', flex: 1, flexDirection: 'row', alignItems: 'center' }}>
        <FlexWidget style={{ flex: 1, flexDirection: 'column', justifyContent: 'center' }}>
          <BigNumber look={look} shown={shown} size={roomy ? 60 : 46} />
          <Text text={item.title} size={roomy ? 17 : 15} color={look.text} font={FONT.roundHeavy} />
          <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3 }}>
            <KindTag look={look} kind={item.kind} size={roomy ? 10 : 9} />
            <Text text={`· ${dateOf(item.targetAt, tz)}`} size={roomy ? 12 : 11} color={look.soft} marginLeft={6} />
          </FlexWidget>
        </FlexWidget>
        <Hidi mood={shown.mood} width={hidi} />
        {count > 1 && (
          <FlexWidget style={{ marginLeft: 8 }}>
            <StackDots look={look} count={count} index={index} />
          </FlexWidget>
        )}
      </FlexWidget>

      <Bar look={look} progress={shown.progress} marginTop={roomy ? 10 : 6} />
    </Page>
  );
}

/** 2×2: the kind and Hidi on top, then the big number, the title and its units, and the bar. */
function SmallPage({ look, item, shown, index, count, height }: PageProps) {
  const roomy = height >= 165;
  return (
    <Page look={look} item={item} shown={shown} padding={roomy ? 14 : 11}>
      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'flex-start' }}>
        <FlexWidget style={{ flex: 1, flexDirection: 'column' }}>
          <SvgWidget svg={kindSvg(item.kind)} style={{ width: 22, height: 22 }} />
        </FlexWidget>
        <Hidi mood={shown.mood} width={roomy ? 56 : 44} />
        {count > 1 && (
          <FlexWidget style={{ marginLeft: 4 }}>
            <StackDots look={look} count={count} index={index} />
          </FlexWidget>
        )}
      </FlexWidget>
      <FlexWidget style={{ width: 'match_parent', flex: 1, flexDirection: 'column', justifyContent: 'flex-end' }}>
        <Text text={shown.big} size={shown.bigIsWord ? (roomy ? 24 : 20) : roomy ? 46 : 38} color={look.text} font={FONT.roundHeavy} />
        <Text text={item.title} size={roomy ? 14 : 13} color={look.text} font={FONT.roundHeavy} />
        {shown.chips.length > 0 && <Text text={shown.chips.slice(0, 2).join(' · ')} size={11} color={look.soft} />}
      </FlexWidget>
      <Bar look={look} progress={shown.progress} height={5} marginTop={roomy ? 8 : 6} />
    </Page>
  );
}

/** 4×4: a header, the soonest as a big card with Hidi's bubble, then the rest as rows. All of it scrolls. */
function LargeList({ look, props }: { look: Look; props: Extract<WidgetProps, { state: 'ready' }> }) {
  const { items, now, tz, widgetId, stale } = props;
  const [first, ...rest] = items;
  const shown = describe(first, now, tz);
  const skin = skinFor(look, shown.mood);
  return (
    <FlexWidget style={{ width: 'match_parent', height: 'match_parent', flexDirection: 'column', padding: 12 }}>
      <FlexWidget style={{ width: 'match_parent', height: 40, flexDirection: 'row', alignItems: 'center', paddingLeft: 4 }}>
        <Hidi mood="calm" width={26} />
        <Text text="Hidl" size={18} color={look.text} font={FONT.roundHeavy} marginLeft={6} />
        <Text
          text={stale ? '· offline' : `· ${items.length} countdown${items.length === 1 ? '' : 's'}`}
          size={12}
          color={look.soft}
          marginLeft={6}
          flex={1}
        />
        <EditButton look={look} widgetId={widgetId} size={30} />
      </FlexWidget>
      <FlexWidget style={{ width: 'match_parent', flex: 1, marginTop: 4 }}>
        <ListWidget style={{ width: 'match_parent', height: 'match_parent' }}>
          <FlexWidget
            key="hero"
            clickAction="OPEN_URI"
            clickActionData={{ uri: countdownUri(first.id) }}
            style={{
              width: 'match_parent',
              height: 170,
              borderRadius: 22,
              backgroundGradient: { from: skin.from, to: skin.to, orientation: 'TL_BR' },
              borderColor: look.glassLine,
              borderWidth: 1,
              padding: 14,
              flexDirection: 'column',
            }}
          >
            <FlexWidget style={{ flexDirection: 'row' }}>
              <Bubble look={look} text={speech(shown)} />
            </FlexWidget>
            <FlexWidget style={{ width: 'match_parent', flex: 1, flexDirection: 'row', alignItems: 'center' }}>
              <FlexWidget style={{ flex: 1, flexDirection: 'column' }}>
                <BigNumber look={look} shown={shown} size={54} />
                <Text text={first.title} size={16} color={look.text} font={FONT.roundHeavy} />
                <Text text={dateOf(first.targetAt, tz)} size={12} color={look.soft} />
              </FlexWidget>
              <Hidi mood={shown.mood} width={84} />
            </FlexWidget>
            <Bar look={look} progress={shown.progress} marginTop={6} />
          </FlexWidget>
          {rest.map((item, i) => {
            const s = describe(item, now, tz);
            return (
              <FlexWidget
                key={item.id ?? `${item.title}-${i}`}
                clickAction="OPEN_URI"
                clickActionData={{ uri: countdownUri(item.id) }}
                style={{ width: 'match_parent', height: 64, paddingTop: 8, flexDirection: 'column' }}
              >
                <FlexWidget
                  style={{
                    width: 'match_parent',
                    height: 56,
                    borderRadius: 18,
                    backgroundColor: look.row,
                    paddingHorizontal: 12,
                    flexDirection: 'row',
                    alignItems: 'center',
                  }}
                >
                  <SvgWidget svg={kindSvg(item.kind)} style={{ width: 28, height: 28 }} />
                  <FlexWidget style={{ flex: 1, marginLeft: 10, flexDirection: 'column' }}>
                    <Text text={item.title} size={15} color={look.text} font={FONT.roundHeavy} />
                    <Text text={dateOf(item.targetAt, tz)} size={11} color={look.soft} />
                  </FlexWidget>
                  <Text text={s.big} size={s.bigIsWord ? 15 : 24} color={look.text} font={FONT.roundHeavy} marginLeft={8} />
                  {!s.bigIsWord && s.chips[0] && <Text text={s.chips[0]} size={11} color={look.soft} marginLeft={4} />}
                </FlexWidget>
              </FlexWidget>
            );
          })}
        </ListWidget>
      </FlexWidget>
    </FlexWidget>
  );
}

function EmptyCard({ look, small, props }: { look: Look; small: boolean; props: WidgetProps }) {
  const error = props.state === 'error';
  const connected = props.state === 'empty' ? props.connected : true;
  // Connected with countdowns, but every one is switched off in this widget's settings.
  const nonePicked = props.state === 'empty' && props.nonePicked === true;
  const title = error ? props.message : !connected ? 'Open Hidl to connect' : nonePicked ? 'Nothing picked yet' : 'Add a countdown';
  const hint = error
    ? 'Tap to open Hidl'
    : !connected
      ? 'Sign in once and I’ll count for you.'
      : nonePicked
        ? 'Tap to choose what I count down.'
        : 'Hidi is ready to count with you!';
  const uri = !connected || error ? undefined : nonePicked ? settingsUri(props.widgetId) : `hidl://open?path=${encodeURIComponent('/countdown/new')}`;
  return (
    <FlexWidget
      clickAction={uri ? 'OPEN_URI' : 'OPEN_APP'}
      clickActionData={uri ? { uri } : undefined}
      style={{
        width: 'match_parent',
        height: 'match_parent',
        padding: small ? 12 : 16,
        flexDirection: small ? 'column' : 'row',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Hidi mood={error ? 'sleepy' : 'calm'} width={small ? 56 : 76} />
      <FlexWidget style={{ flex: small ? undefined : 1, marginLeft: small ? 0 : 14, marginTop: small ? 6 : 0, flexDirection: 'column' }}>
        <Text text={title} size={small ? 15 : 20} color={look.text} font={FONT.roundHeavy} lines={2} align={small ? 'center' : undefined} />
        {!small && <Text text={hint} size={13} color={look.soft} lines={2} marginTop={2} />}
      </FlexWidget>
    </FlexWidget>
  );
}

/** What Hidi says: "3 days to go. Almost there!" (just the line on the day and after it). */
function speech(shown: Shown) {
  if (shown.bigIsWord || !shown.chips[0] || shown.mood === 'party' || shown.mood === 'sleepy') return shown.line;
  return `${shown.big} ${shown.chips[0]} ${shown.mood === 'nervous' ? 'left' : 'to go'}. ${shown.line}`;
}

/** "Mon, Nov 16" in the owner's zone; plain if this phone can't format time zones. */
function dateOf(targetAt: string, tz?: string) {
  const d = new Date(targetAt);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: tz });
  } catch {
    return d.toDateString().slice(0, 10);
  }
}
