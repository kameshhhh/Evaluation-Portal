// ============================================================
// CREDIBILITY TREND CHART — SRS §5.1, §6.1
// ============================================================
// Lightweight canvas-based chart for credibility history.
// No external charting library — pure HTML5 Canvas.
//
// Displays:
//   - Line chart of credibility scores over time
//   - Min/max/average indicators
//   - Date labels on X-axis
//   - Score labels on Y-axis
// ============================================================

import React, { useEffect, useRef } from "react";
import PropTypes from "prop-types";

/**
 * CredibilityTrendChart — Canvas-based trend visualization
 *
 * @param {Object} props
 * @param {Array} props.history - Array of {score, calculated_at} objects
 * @param {number} props.currentScore - Current credibility score
 * @param {number} [props.height=200] - Chart height in pixels
 */
const CredibilityTrendChart = ({
  history = [],
  currentScore,
  height = 200,
}) => {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    // Get actual rendered width (responsive)
    const width = canvas.clientWidth;
    const heightCanvas = canvas.clientHeight;

    // Set canvas resolution (for crisp lines on high-DPI displays)
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = heightCanvas * dpr;
    ctx.scale(dpr, dpr);

    // Prepare data points — oldest to newest
    let points = [...history].reverse();
    if (currentScore !== null && currentScore !== undefined) {
      points = [...points, { score: currentScore, calculated_at: new Date() }];
    }

    // If insufficient data, show placeholder message
    if (points.length < 2) {
      ctx.font = "13px Inter, system-ui, sans-serif";
      ctx.fillStyle = "#6B7280";
      ctx.textAlign = "center";
      ctx.fillText(
        "Not enough history data yet",
        width / 2,
        heightCanvas / 2 - 10,
      );
      ctx.font = "11px Inter, system-ui, sans-serif";
      ctx.fillText(
        "Complete more evaluations to see trends",
        width / 2,
        heightCanvas / 2 + 10,
      );
      return;
    }

    // Calculate score range for Y-axis
    const scores = points.map((p) => p.score);
    const minScore = Math.max(0, Math.min(...scores) - 10);
    const maxScore = Math.min(100, Math.max(...scores) + 10);
    const scoreRange = maxScore - minScore || 1;

    // Chart margins
    const marginLeft = 45;
    const marginRight = 20;
    const marginTop = 20;
    const marginBottom = 30;
    const chartWidth = width - marginLeft - marginRight;
    const chartHeight = heightCanvas - marginTop - marginBottom;

    // Clear canvas
    ctx.clearRect(0, 0, width, heightCanvas);

    // Draw background gradient
    const bgGradient = ctx.createLinearGradient(
      0,
      marginTop,
      0,
      heightCanvas - marginBottom,
    );
    bgGradient.addColorStop(0, "rgba(124, 58, 237, 0.03)");
    bgGradient.addColorStop(1, "rgba(124, 58, 237, 0.01)");
    ctx.fillStyle = bgGradient;
    ctx.fillRect(marginLeft, marginTop, chartWidth, chartHeight);

    // Draw horizontal grid lines
    ctx.strokeStyle = "#E5E7EB";
    ctx.lineWidth = 0.5;
    const gridLines = 4;
    for (let i = 0; i <= gridLines; i++) {
      const y = marginTop + (chartHeight / gridLines) * i;
      ctx.beginPath();
      ctx.moveTo(marginLeft, y);
      ctx.lineTo(width - marginRight, y);
      ctx.stroke();

      // Y-axis labels
      const scoreLabel = Math.round(maxScore - (scoreRange / gridLines) * i);
      ctx.fillStyle = "#9CA3AF";
      ctx.font = "11px Inter, system-ui, sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(scoreLabel.toString(), marginLeft - 8, y + 4);
    }

    // Calculate point positions
    const pointPositions = points.map((point, index) => ({
      x: marginLeft + (index / (points.length - 1)) * chartWidth,
      y: marginTop + ((maxScore - point.score) / scoreRange) * chartHeight,
      score: point.score,
      date: point.calculated_at,
    }));

    // Draw area fill under line
    ctx.beginPath();
    ctx.moveTo(pointPositions[0].x, marginTop + chartHeight);
    pointPositions.forEach((pos) => ctx.lineTo(pos.x, pos.y));
    ctx.lineTo(
      pointPositions[pointPositions.length - 1].x,
      marginTop + chartHeight,
    );
    ctx.closePath();

    const areaGradient = ctx.createLinearGradient(
      0,
      marginTop,
      0,
      marginTop + chartHeight,
    );
    areaGradient.addColorStop(0, "rgba(124, 58, 237, 0.15)");
    areaGradient.addColorStop(1, "rgba(124, 58, 237, 0.02)");
    ctx.fillStyle = areaGradient;
    ctx.fill();

    // Draw line
    ctx.beginPath();
    ctx.strokeStyle = "#7C3AED";
    ctx.lineWidth = 2.5;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    pointPositions.forEach((pos, index) => {
      if (index === 0) {
        ctx.moveTo(pos.x, pos.y);
      } else {
        ctx.lineTo(pos.x, pos.y);
      }
    });
    ctx.stroke();

    // Draw data points
    pointPositions.forEach((pos, index) => {
      const isLast = index === pointPositions.length - 1;

      // Outer circle (white border)
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, isLast ? 6 : 4, 0, 2 * Math.PI);
      ctx.fillStyle = "#FFFFFF";
      ctx.fill();
      ctx.strokeStyle = "#7C3AED";
      ctx.lineWidth = isLast ? 2.5 : 2;
      ctx.stroke();

      // Inner fill for last point
      if (isLast) {
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 3, 0, 2 * Math.PI);
        ctx.fillStyle = "#7C3AED";
        ctx.fill();

        // Label for current score
        ctx.fillStyle = "#1E1E1E";
        ctx.font = "bold 12px Inter, system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(pos.score.toString(), pos.x, pos.y - 12);
      }
    });

    // Draw date labels on X-axis
    if (points.length >= 2) {
      ctx.fillStyle = "#9CA3AF";
      ctx.font = "10px Inter, system-ui, sans-serif";

      // First date
      const firstDate = new Date(points[0].calculated_at);
      ctx.textAlign = "left";
      ctx.fillText(
        firstDate.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
        marginLeft,
        heightCanvas - 8,
      );

      // Last date
      const lastDate = new Date(points[points.length - 1].calculated_at);
      ctx.textAlign = "right";
      ctx.fillText(
        lastDate.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
        width - marginRight,
        heightCanvas - 8,
      );
    }
  }, [history, currentScore, height]);

  return (
    <div className="w-full bg-white rounded-xl overflow-hidden">
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: `${height}px` }}
        className="w-full"
      />
    </div>
  );
};

CredibilityTrendChart.propTypes = {
  history: PropTypes.arrayOf(
    PropTypes.shape({
      score: PropTypes.number,
      calculated_at: PropTypes.oneOfType([
        PropTypes.string,
        PropTypes.instanceOf(Date),
      ]),
    }),
  ),
  currentScore: PropTypes.number,
  height: PropTypes.number,
};

export default CredibilityTrendChart;
