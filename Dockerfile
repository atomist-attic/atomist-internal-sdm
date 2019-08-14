FROM atomist/sdm-base:0.2.0

RUN apt-get update && apt-get install -y \
    openjdk-8-jdk \
    maven \
    && rm -rf /var/lib/apt/lists/*

RUN curl -sL -o /usr/local/bin/kubectl https://storage.googleapis.com/kubernetes-release/release/v1.8.12/bin/linux/amd64/kubectl \
    && chmod +x /usr/local/bin/kubectl \
    && kubectl version --client

RUN curl -sL -o /usr/local/bin/lein https://raw.githubusercontent.com/technomancy/leiningen/stable/bin/lein \
    && chmod 755 /usr/local/bin/lein \
    && lein version

RUN update-java-alternatives -s java-1.8.0-openjdk-amd64

COPY package.json package-lock.json ./

RUN npm ci\
    && npm cache clean --force

COPY . ./
