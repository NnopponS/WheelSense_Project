Expected figure assets for Chapter 4 (Phase 1 scaffold, exact plan filenames):

  ch4-fig01-site.pdf
  ch4-fig02-install.jpg
  ch4-fig03-server.jpg
  ch4-fig04-imu-rate.pdf
  ch4-fig05-telem-gap.pdf
  ch4-fig06-loc-confusion.pdf
  ch4-fig07-loc-robust.pdf
  ch4-fig08-throughput.pdf
  ch4-fig09-llm-latency.pdf
  ch4-fig10-llm-similarity.pdf
  ch4-fig11-ai-chat.png
  ch4-fig12-ux-likert.pdf
  ch4-fig13-e2e-latency.pdf
  ch4-fig14-feedback.jpg

Notes:
  - This chapter was empty before the scaffold pass.
  - PDF, PNG, and JPG placeholder cards now exist with exact plan basenames.
  - Data-driven figures should later be replaced through latex/scripts/plot_ch4_metrics_stub.py.

Generated synthetic plots now available from thesis-stated values:

  plot-mqtt-latency-box.png
    Grouped latency view derived from the MQTT latency table in chapter4.tex.

  plot-llm-ttft-tokens.png
    TTFT and token-rate trend derived from the LLM latency table in chapter4.tex.

Source:
  Thesis/latex/scripts/gen_ch3_arch_figures.py
