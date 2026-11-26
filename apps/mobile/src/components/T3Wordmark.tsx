import type { ColorValue } from "react-native";
import Svg, { Path } from "react-native-svg";
import { withUniwind } from "uniwind";

const ThemedPath = withUniwind(Path);

export function T3Wordmark(props: {
  readonly height: number;
  readonly color?: ColorValue;
  readonly colorClassName?: string;
}) {
  const aspectRatio = 94.5 / 51.88;
  return (
    <Svg
      accessibilityLabel="KB"
      height={props.height}
      width={props.height * aspectRatio}
      viewBox="15.53 39.55 94.5 51.88"
    >
      <ThemedPath
        fillRule="evenodd"
        d="M15.53 39.55H27.57V59.93L47.96 39.55H62.78L40.54 61.79L63.71 91.43H48.88L32.21 69.20L27.57 73.83V91.43H15.53Z M67.41 39.55H90.57C101.69 39.55 107.25 45.57 107.25 52.98C107.25 58.54 104.47 62.25 99.84 64.10C105.86 65.95 110.03 70.59 110.03 77.54C110.03 85.87 103.54 91.43 91.50 91.43H67.41ZM79.46 49.74V60.86H88.72C92.89 60.86 95.21 59.01 95.21 55.30C95.21 51.59 92.89 49.74 88.72 49.74ZM79.46 70.12V81.24H90.57C95.21 81.24 97.52 79.39 97.52 75.68C97.52 71.98 95.21 70.12 90.57 70.12Z"
        color={props.color}
        colorClassName={props.colorClassName}
        fill="currentColor"
      />
    </Svg>
  );
}
