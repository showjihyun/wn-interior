FROM nvidia/cuda:11.8.0-cudnn8-devel-ubuntu22.04

ARG DEBIAN_FRONTEND=noninteractive
ARG RASTER2SEQ_COMMIT=a6c4e27a68d11d7a459f6e4a2601fd887227dd1a

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    TORCH_CUDA_ARCH_LIST=8.6

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    git \
    libglib2.0-0 \
    libgl1 \
    ninja-build \
    python3.10 \
    python3.10-dev \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

RUN python3.10 -m pip install --upgrade pip "setuptools<70" wheel && \
    python3.10 -m pip install \
      torch==2.3.1 torchvision==0.18.1 torchaudio==2.3.1 \
      --index-url https://download.pytorch.org/whl/cu118

WORKDIR /opt
RUN git clone https://github.com/Cornell-VAILab/Raster2Seq.git raster2seq && \
    cd raster2seq && \
    git checkout "${RASTER2SEQ_COMMIT}" && \
    sed -i 's/^opencv-python$/opencv-python==4.10.0.84/' requirements.txt && \
    sed -i 's/^scipy==1.8.1$/scipy==1.11.4/' requirements.txt && \
    sed -i 's/if torch.cuda.is_available() and CUDA_HOME is not None:/if CUDA_HOME is not None:/' models/ops/setup.py

WORKDIR /opt/raster2seq
RUN python3.10 -m pip install -r requirements.txt plotly einops
RUN cd models/ops && python3.10 setup.py build install && \
    cd ../../diff_ras && python3.10 setup.py build develop

COPY container-run.sh /usr/local/bin/raster2seq-benchmark
RUN chmod +x /usr/local/bin/raster2seq-benchmark

ENTRYPOINT ["/usr/local/bin/raster2seq-benchmark"]
