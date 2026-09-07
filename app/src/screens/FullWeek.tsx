import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { FULL_WEEK_IMAGE_URL } from "../calendarConfig";

const PLACEHOLDER = /^PASTE_/;

/**
 * Full Week Schedule (PAGES.md §11): the OC's static whole-week schedule image
 * in an off-the-shelf zoom/pan viewer (react-zoom-pan-pinch). The wide view the
 * Home widget deliberately isn't. Reachable by anyone via [View Full Week].
 *
 * Deliberately chrome-free: the image is the screen. It breaks out of the
 * centered `.screen` column and fills everything above the bottom nav, with the
 * only control a floating back chip over the top-left corner — a schedule
 * poster is dense, so every pixel spent on framing is a pixel not spent on it.
 */
export function FullWeek({ onBack }: { onBack: () => void }) {
  const configured =
    !!FULL_WEEK_IMAGE_URL && !PLACEHOLDER.test(FULL_WEEK_IMAGE_URL);

  return (
    <div className="fullweek">
      {configured ? (
        <TransformWrapper centerOnInit doubleClick={{ mode: "toggle" }}>
          <TransformComponent
            wrapperClass="fullweek-wrapper"
            contentClass="fullweek-content"
          >
            <img
              src={FULL_WEEK_IMAGE_URL}
              alt="Full week schedule"
              className="fullweek-img"
            />
          </TransformComponent>
        </TransformWrapper>
      ) : (
        <p className="fullweek-empty">
          The full-week schedule image hasn't been added yet.
        </p>
      )}

      <button className="fullweek-back" type="button" onClick={onBack}>
        ‹ Home
      </button>
    </div>
  );
}
