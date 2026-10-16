import * as echarts from 'echarts/core';
import { BarChart, LineChart, ScatterChart, GraphChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, MarkAreaComponent, MarkLineComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([BarChart, LineChart, ScatterChart, GraphChart, GridComponent, TooltipComponent, MarkAreaComponent, MarkLineComponent, CanvasRenderer]);

export { echarts };
export type EChartsOption = echarts.EChartsCoreOption;
