(defproject atomist/dactyl "0.0.1-SNAPSHOT"

  :description "API for fingerprints"
  :url "https://github.com/atomisthq/dactyl"

  :dependencies [[org.clojure/clojure "1.10.1"]

                 ; logging
                 [io.clj/logging "0.8.1" :exclusions [org.clojure/tools.logging]]
                 [ch.qos.logback/logback-classic "1.2.3"]
                 [org.slf4j/jcl-over-slf4j "1.7.26"]
                 [org.slf4j/jul-to-slf4j "1.7.26"]
                 [org.slf4j/log4j-over-slf4j "1.7.26"]
                 [org.slf4j/slf4j-api "1.7.26"]
                 [io.logz.logback/logzio-logback-appender "1.0.20"]
                 [com.humio.logback/humio-logback-appender "0.6.0"]

                 ; AWS
                 [com.taoensso/nippy "2.14.0" :exclusions [com.taoensso/encore org.clojure/tools.reader]]
                 [com.amazonaws/aws-java-sdk-dynamodb "1.11.540" :exclusions [commons-logging joda-time com.fasterxml.jackson.core/jackson-databind]]
                 [com.fasterxml.jackson.core/jackson-databind "2.9.8"]
                 ;dynamo
                 [com.taoensso/faraday "1.9.0" :exclusions [com.taoensso/encore com.taoensso/nippy com.amazonaws/aws-java-sdk-dynamodb joda-time]]

                 ; Utils
                 [cheshire "5.8.1"]
                 [mount "0.1.16"]
                 [diehard "0.8.3"]
                 [io.replikativ/hasch "0.3.5" :exclusions [org.clojure/tools.reader]]
                 [com.rpl/specter "1.1.2"]

                 ; vault
                 [amperity/vault-clj "0.6.5" :exclusions [org.clojure/tools.logging clj-http]]

                 ;web
                 [metosin/compojure-api "1.1.12" :exclusions [joda-time prismatic/plumbing potemkin prismatic/schema frankiesardo/linked]]
                 [prismatic/plumbing "0.5.5" :exclusions [prismatic/schema]] ;;required by compojure-api and ring-swagger (dev only, but has higher version)
                 [frankiesardo/linked "1.3.0"]
                 [http-kit "2.3.0"]
                 [metosin/ring-http-response "0.9.1"]
                 [ring-middleware-format "0.7.4" :exclusions [org.clojure/tools.reader]]
                 [ring/ring-core "1.7.1" :exclusions [clj-time]]
                 [ring/ring-json "0.4.0"]
                 [ring/ring-defaults "0.3.2"]
                 [amalloy/ring-gzip-middleware "0.1.3"]

                 ;graphql
                 [com.walmartlabs/lacinia "0.33.0"]

                 ;atomist
                 [com.atomist/clj-token "2.0.0-20190208145539"]
                 [com.atomist/redis "0.1.0-20190618095259"]
                 [com.atomist/caches "0.1.0-20190619083549"]
                 [com.atomist/clj-config "17.0.9-20190619132958" :exclusions [commons-logging org.clojure/clojure org.slf4j/slf4j-log4j12 commons-codec]]
                 [com.atomist/clj-utils "0.0.8"]
                 [com.atomist/kafka-lib "6.0.37" :exclusions [org.clojure/clojure com.fasterxml.jackson.core/jackson-core]]
                 [com.atomist/metrics "0.1.9-20190511200457"]
                 [com.atomist/threadpool "0.1.3-20190509091332"]]

  :exclusions [com.google.code.findbugs/jsr305]
  :min-lein-version "2.6.1"

  :jvm-opts ["-server"]
  :source-paths ["src/clj"]
  :test-paths ["test/clj"]
  :resource-paths ["resources"]
  :target-path "target/%s/"
  :main atomist.dactyl.core
  :ato [atomist.dactyl.core]
  :container {:name "dactyl"
              :dockerfile "/docker"
              :hub "sforzando-dockerv2-local.jfrog.io"}

  :dependency-check {:properties-file "dependency-check.properties"
                     :suppression-file "suppressions.xml"}

  :jar-name "dactyl.jar"

  :repositories [["releases" {:url      "https://sforzando.jfrog.io/sforzando/libs-release-local"
                              :username [:gpg :env/artifactory_user]
                              :password [:gpg :env/artifactory_pwd]}]
                 ["plugins" {:url      "https://sforzando.jfrog.io/sforzando/sforzando/plugins-release"
                             :username [:gpg :env/artifactory_user]
                             :password [:gpg :env/artifactory_pwd]}]]

  :dynamodb-local {:port 6798
                   :in-memory? true
                   :shared-db? true}

  :plugins [[com.livingsocial/lein-dependency-check "1.1.2"]]

  :profiles
  {:metajar {:direct-linking true
             :aot :all}

   :dev {:dependencies [[prone "1.6.3"]
                        [ring/ring-mock "0.3.2"]
                        [ring/ring-devel "1.7.1" :exclusions [joda-time]]
                        [clj-http-fake "1.0.3" :exclusions [clj-http org.apache.httpcomponents/httpcore org.apache.httpcomponents/httpclient org.apache.httpcomponents/httpmime]]
                        [metosin/ring-swagger "0.26.2" :exclusions [joda-time prismatic/schema frankiesardo/linked prismatic/plumbing]]]

         :test-selectors {:default (complement (fn [x] (some identity ((juxt :swagger) x))))
                          :swagger :swagger}

         :plugins [[com.jakemccrary/lein-test-refresh "0.18.1"]
                   [lein-metajar "0.1.1"]
                   [lein-set-version "0.4.1"]
                   [clj-dynamodb-local "0.1.2"]]

         :source-paths ["dev/clj"]
         :resource-paths ["dev/resources"]
         :repl-options {:init-ns user}}

   :test-refresh {:plugins
                  [[com.jakemccrary/lein-test-refresh "0.23.0"]
                   [venantius/ultra "0.5.2"]]
                  :aot ^:replace []
                  :target-path "target/%s/"}})
