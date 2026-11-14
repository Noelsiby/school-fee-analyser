// Percentage in each exam (solid) against the class average (dashed) and the pass mark.
import { useState } from 'react';
import { View, Text } from 'react-native';
import Svg, { Line, Polyline, Circle, Text as SvgText } from 'react-native-svg';
import { C } from '../lib/theme';

export default function ProgressChart({ exams, passMark }) {
  const [width, setWidth] = useState(0);
  const pts = exams.filter((e) => e.complete && e.percentage !== null);
  const H = 190, L = 30, R = 12, T = 16, B = 34;
  const x = (i) => L + (pts.length === 1 ? (width - L - R) / 2 : (i * (width - L - R)) / Math.max(1, pts.length - 1));
  const y = (v) => T + (1 - v / 100) * (H - T - B);
  const line = (key) => pts.map((p, i) => (p[key] === null || p[key] === undefined ? null : `${x(i)},${y(p[key])}`)).filter(Boolean).join(' ');
  const short = (t) => (t.length > 10 ? `${t.slice(0, 9)}…` : t);

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 && pts.length > 0 && (
        <Svg width={width} height={H}>
          {[0, 50, 100].map((v) => (
            <Line key={v} x1={L} x2={width - R} y1={y(v)} y2={y(v)} stroke={C.line} strokeWidth={1} />
          ))}
          {[0, 50, 100].map((v) => (
            <SvgText key={`t${v}`} x={L - 6} y={y(v) + 4} fontSize={10} fill={C.faint} textAnchor="end">{v}</SvgText>
          ))}
          {passMark > 0 && <Line x1={L} x2={width - R} y1={y(passMark)} y2={y(passMark)} stroke={C.red} strokeWidth={1} strokeDasharray="2 4" />}
          <Polyline points={line('classAverage')} fill="none" stroke={C.faint} strokeWidth={1.6} strokeDasharray="6 5" />
          <Polyline points={line('percentage')} fill="none" stroke={C.navy} strokeWidth={2.6} />
          {pts.map((p, i) => (
            <Circle key={i} cx={x(i)} cy={y(p.percentage)} r={4.5} fill="#fff" stroke={C.navy} strokeWidth={2.4} />
          ))}
          {pts.map((p, i) => (
            <SvgText key={`v${i}`} x={x(i)} y={y(p.percentage) - 9} fontSize={11} fontWeight="bold" fill={C.ink} textAnchor="middle">{Math.round(p.percentage)}%</SvgText>
          ))}
          {pts.map((p, i) => (
            <SvgText key={`l${i}`} x={x(i)} y={H - 12} fontSize={10} fill={C.muted} textAnchor="middle">{short(p.examName)}</SvgText>
          ))}
        </Svg>
      )}
      <View style={{ flexDirection: 'row', gap: 14, marginTop: 4, flexWrap: 'wrap' }}>
        <Text style={{ fontSize: 12, color: C.navy }}>━ Your child</Text>
        <Text style={{ fontSize: 12, color: C.faint }}>╌ Class average</Text>
        <Text style={{ fontSize: 12, color: C.red }}>┈ Pass mark {passMark}%</Text>
      </View>
    </View>
  );
}
