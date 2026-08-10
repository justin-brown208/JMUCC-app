import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { FULL_WEEK_IMAGE_URL } from "../calendarConfig";

const PLACEHOLDER = /^PASTE_/;

/**
 * Full Week Schedule (PAGES.md §11): the OC's static whole-week schedule image
 * in an off-the-shelf zoom/pan viewer (react-zoom-pan-pinch). The wide view the
 * Home widget deliberately isn't. Reachable by anyone via [View Full Week].
 */
export function FullWeek({ onBack }: { onBack: () => void }) {
  const configured =
    !!FULL_WEEK_IMAGE_URL && !PLACEHOLDER.test(FULL_WEEK_IMAGE_URL);

  return (
    <div className="screen">
      <button className="back" type="button" onClick={onBack}>
        ‹ Home
      </button>
      <h1 className="title">Full Week Schedule</h1>

      {configured ? (
        <div className="fullweek-viewer">
          <TransformWrapper centerOnInit doubleClick={{ mode: "toggle" }}>
            <TransformComponent
              wrapperStyle={{ width: "100%", height: "100%" }}
              contentStyle={{ width: "100%", height: "100%" }}
            >
              <img
                src={FULL_WEEK_IMAGE_URL}
                alt="Full week schedule"
                className="fullweek-img"
              />
            </TransformComponent>
          </TransformWrapper>
        </div>
      ) : (
        <p className="help">
          The full-week schedule image hasn't been added yet.
        </p>
      )}
    </div>
  );
}
