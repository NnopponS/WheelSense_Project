import React from 'react';
import Svg, { Circle, Path, Text as SvgText, G } from 'react-native-svg';

interface LogoProps {
  size?: number;
  color?: string;
  bgColor?: string;
}

export const Logo: React.FC<LogoProps> = ({ 
  size = 100, 
  color = '#000000', // Black as requested
  bgColor = 'transparent' 
}) => {
  const strokeWidth = 5;
  const radius = 40;
  const center = 50;

  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      {bgColor !== 'transparent' && (
        <Circle cx={center} cy={center} r={50} fill={bgColor} />
      )}
      
      {/* Circle with a break on the right side */}
      <Path
        d="M 90 50 A 40 40 0 1 1 90 49"
        stroke={color}
        strokeWidth={strokeWidth}
        fill="none"
        strokeLinecap="round"
      />

      {/* The Dot on the right side */}
      <Circle 
        cx="90" 
        cy="50" 
        r="6" 
        fill={color} 
      />

      {/* Minimalist 'W' in the center */}
      <SvgText
        x="50"
        y="62" // Adjusted for vertical centering in the circle
        fontSize="32"
        fontWeight="800"
        fill={color}
        textAnchor="middle"
        fontFamily="System"
      >
        W
      </SvgText>
    </Svg>
  );
};

export default Logo;
