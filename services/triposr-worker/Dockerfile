FROM pytorch/pytorch:2.2.1-cuda12.1-cudnn8-devel

ARG TRIPOSR_COMMIT=107cefdc244c39106fa830359024f6a2f1c78871
ENV DEBIAN_FRONTEND=noninteractive \
    PIP_NO_CACHE_DIR=1 \
    PYTHONUNBUFFERED=1 \
    HF_HOME=/models/huggingface \
    U2NET_HOME=/models/rembg \
    TRIPOSR_ROOT=/opt/TripoSR \
    TRIPOSR_VERSION=${TRIPOSR_COMMIT} \
    TORCH_CUDA_ARCH_LIST=8.6 \
    CMAKE_CUDA_ARCHITECTURES=86

RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential git libegl1 libgl1 libglib2.0-0 ninja-build && \
    rm -rf /var/lib/apt/lists/*

RUN git clone https://github.com/VAST-AI-Research/TripoSR.git /opt/TripoSR && \
    cd /opt/TripoSR && git checkout ${TRIPOSR_COMMIT}

COPY requirements.txt /service/requirements.txt
RUN pip install --upgrade setuptools wheel && \
    pip install -r /service/requirements.txt

WORKDIR /service
COPY app.py /service/app.py
COPY geometry.py image_metrics.py /service/
COPY tests /service/tests
EXPOSE 8980

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8980", "--workers", "1"]
